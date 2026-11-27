package ru.paseka.journal.qa.voice;

import android.Manifest;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;
import java.io.*;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.zip.*;

@CapacitorPlugin(name="PasekaOfflineSpeech", permissions={
    @Permission(alias="microphone", strings={Manifest.permission.RECORD_AUDIO})
})
public final class PasekaVoiceQaPlugin extends Plugin {
    private static final String QA="ru.paseka.journal.qa.voice";
    private static final String MODEL="vosk-model-small-ru-0.22";
    private static final String ASSET="voice-qa/"+MODEL+".zip";
    private static final String SHA="961d5ff98a17f4aa6de69864d0aa71fa5bac682301d2b5d17a3f24c5c99a46d4";
    private static final long ARCHIVE_BYTES=46236750L, EXPANDED_BYTES=91289240L;
    private static final String[] REQUIRED={"am/final.mdl","conf/mfcc.conf","conf/model.conf","graph/HCLr.fst","graph/Gr.fst"};
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final AtomicLong epoch=new AtomicLong();
    private volatile boolean foreground=true, destroyed=false;
    private volatile Session current;
    // Permission requests are tied to the exact start call, not the next session.
    private volatile PluginCall permissionCall;
    private volatile long permissionEpoch;
    private static final class Session {
        final long id;
        final String token;
        Model model;
        Recognizer recognizer;
        SpeechService service;
        Session(long id,String token){this.id=id;this.token=token;}
    }
    private boolean qa(){return getActivity()!=null && QA.equals(getActivity().getPackageName());}
    private File parent(){return new File(getContext().getFilesDir(),"voice-model-qa");}
    private File destination(){return new File(parent(),MODEL);}
    private boolean ready(){
        try{
            File dir=destination();
            if(!dir.isDirectory())return false;
            for(String f:REQUIRED){File file=new File(dir,f);if(!file.isFile()||file.length()==0)return false;}
            File marker=new File(dir,".paseka-verified-sha");
            return marker.isFile() && marker.length()==64 &&
              SHA.equals(new String(Files.readAllBytes(marker.toPath()),StandardCharsets.US_ASCII));
        }catch(Exception e){return false;}
    }
    private boolean valid(long id){return !destroyed&&foreground&&epoch.get()==id;}
    private void submit(PluginCall call,Runnable job){
        try{worker.execute(job);}catch(RejectedExecutionException e){call.reject("Голосовой модуль закрыт.","VOICE_CLOSED");}
    }
    @PluginMethod public void getStatus(PluginCall call){
        if(!qa()){call.reject("Только отдельный QA пакет.","QA_ONLY");return;}
        JSObject out=new JSObject();out.put("modelInstalled",ready());out.put("provider","vosk-android-local");
        out.put("modelVersion",MODEL);out.put("bundled",true);call.resolve(out);
    }
    @PluginMethod public void installModel(PluginCall call){
        if(!qa()||destroyed||!foreground){call.reject("Требуется открытый QA экран.","QA_ONLY");return;}
        submit(call,()->{
            if(destroyed||!foreground||current!=null){call.reject("Заверши сеанс перед установкой.","VOICE_ACTIVE");return;}
            try{
                installVerifiedAsset();
                JSObject result=new JSObject();result.put("modelInstalled",true);call.resolve(result);
            }catch(Exception e){call.reject("Модель не установлена: "+e.getMessage(),"MODEL_INVALID");}
        });
    }
    private static String hex(byte[] value){
        StringBuilder out=new StringBuilder();for(byte b:value)out.append(String.format(java.util.Locale.ROOT,"%02x",b&255));return out.toString();
    }
    private void installVerifiedAsset() throws Exception{
        if(ready())return;
        if(destination().exists())throw new IOException("Существующая модель не прошла проверку; не перезаписываем.");
        if(!parent().mkdirs()&&!parent().isDirectory())throw new IOException("Нет папки модели");
        MessageDigest sha=MessageDigest.getInstance("SHA-256");long received=0;byte[] buffer=new byte[32768];
        try(InputStream input=getContext().getAssets().open(ASSET)){
            int n;while((n=input.read(buffer))!=-1){received+=n;if(received>ARCHIVE_BYTES)throw new IOException("Размер ZIP");sha.update(buffer,0,n);}
        }
        if(received!=ARCHIVE_BYTES||!SHA.equals(hex(sha.digest())))throw new IOException("SHA-256 ZIP не совпадает");
        File stage=Files.createTempDirectory(parent().toPath(),"install-").toFile();
        try{
            long expanded=0;int files=0,entries=0;HashSet<String> seen=new HashSet<>();
            String prefix=stage.getCanonicalPath()+File.separator;
            try(ZipInputStream zip=new ZipInputStream(new BufferedInputStream(getContext().getAssets().open(ASSET)))){
                ZipEntry entry;
                while((entry=zip.getNextEntry())!=null){
                    if(++entries>20000)throw new IOException("Слишком много ZIP entries");
                    String raw=entry.getName(),name=raw.endsWith("/")?raw.substring(0,raw.length()-1):raw;
                    if(!name.equals(MODEL)&&!name.startsWith(MODEL+"/"))throw new IOException("Неизвестный корень ZIP");
                    if(name.indexOf('\\')>=0||name.indexOf('\0')>=0||!seen.add(name))throw new IOException("Небезопасный ZIP entry");
                    for(String part:name.split("/",-1))if(part.isEmpty()||part.equals(".")||part.equals(".."))throw new IOException("Небезопасный путь");
                    File target=new File(stage,name);
                    if(!target.getCanonicalPath().startsWith(prefix))throw new IOException("Путь вне модели");
                    if(entry.isDirectory()){
                        if(!target.mkdirs()&&!target.isDirectory())throw new IOException("Папка ZIP");
                    }else{
                        if(name.equals(MODEL)||target.exists())throw new IOException("Повторный файл ZIP");
                        File dir=target.getParentFile();
                        if(!dir.mkdirs()&&!dir.isDirectory())throw new IOException("Папка файла");
                        try(OutputStream output=new BufferedOutputStream(new FileOutputStream(target))){
                            int n;while((n=zip.read(buffer))!=-1){
                                expanded+=n;if(expanded>EXPANDED_BYTES)throw new IOException("Размер распаковки");
                                output.write(buffer,0,n);
                            }
                        }
                        files++;
                    }
                    zip.closeEntry();
                }
            }
            File extracted=new File(stage,MODEL);
            if(expanded!=EXPANDED_BYTES||files!=14)throw new IOException("Неожиданный состав ZIP");
            for(String f:REQUIRED){File file=new File(extracted,f);if(!file.isFile()||file.length()==0)throw new IOException("Нет "+f);}
            Files.write(new File(extracted,".paseka-verified-sha").toPath(),SHA.getBytes(StandardCharsets.US_ASCII));
            if(destroyed||!foreground)throw new IOException("Установка прервана; открой приложение снова");
            if(destination().exists()||!extracted.renameTo(destination()))throw new IOException("Не удалось атомарно установить модель");
            if(!ready())throw new IOException("Не прошла проверка установленной модели");
        }finally{removeStaging(stage);}
    }
    // Only the fresh private install staging directory is ever removed.
    private static void removeStaging(File file){
        if(file.isDirectory()){File[] children=file.listFiles();if(children!=null)for(File child:children)removeStaging(child);}
        file.delete();
    }
    @PluginMethod public synchronized void start(PluginCall call){
        String token=call.getString("token","");
        if(!qa()||!foreground||destroyed||!token.matches("[A-Za-z0-9_-]{1,80}")||!ready()){
            call.reject("Открой QA, установи модель и начни сеанс.","VOICE_NOT_READY");return;
        }
        if(permissionCall!=null){call.reject("Дождись запроса разрешения.","PERMISSION_PENDING");return;}
        long id=epoch.incrementAndGet();
        if(getPermissionState("microphone")!=PermissionState.GRANTED){
            permissionCall=call;permissionEpoch=id;
            try{requestPermissionForAlias("microphone",call,"microphoneResult");}
            catch(Exception e){permissionCall=null;call.reject("Не удалось запросить микрофон.","PERMISSION_FAILED");}
            return;
        }
        begin(call,id,token);
    }
    @PermissionCallback private synchronized void microphoneResult(PluginCall call){
        long id=permissionEpoch;
        if(permissionCall!=call){call.reject("Устаревший запрос.","VOICE_CANCELLED");return;}
        permissionCall=null;
        if(!valid(id)||getPermissionState("microphone")!=PermissionState.GRANTED){
            call.reject("Разрешение не получено либо сеанс отменён.","VOICE_CANCELLED");return;
        }
        begin(call,id,call.getString("token",""));
    }
    private void begin(PluginCall call,long id,String token){
        submit(call,()->{
            if(!valid(id)){call.reject("Сеанс отменён.","VOICE_CANCELLED");return;}
            close(current);
            Session session=new Session(id,token);current=session;
            try{
                session.model=new Model(destination().getAbsolutePath());
                if(!valid(id))throw new IOException("Сеанс отменён");
                session.recognizer=new Recognizer(session.model,16000f);
                session.service=new SpeechService(session.recognizer,16000f);
                if(!valid(id)||!session.service.startListening(new RecognitionListener(){
                    @Override public void onPartialResult(String raw){}
                    @Override public void onResult(String raw){publish(session,raw);}
                    @Override public void onFinalResult(String raw){publish(session,raw);}
                    @Override public void onError(Exception e){fail(session,"Ошибка локального распознавания");}
                    @Override public void onTimeout(){fail(session,"Истекло время ожидания");}
                }))throw new IOException("Микрофон не запущен");
                if(!valid(id))throw new IOException("Сеанс отменён");
                JSObject result=new JSObject();result.put("started",true);result.put("token",token);call.resolve(result);
            }catch(Exception e){close(session);call.reject("Не удалось запустить Vosk: "+e.getMessage(),"VOICE_START_FAILED");}
        });
    }
    private void publish(Session session,String raw){
        if(current!=session||!valid(session.id))return;
        try{
            String text=new JSONObject(raw).optString("text","").trim();
            if(text.isEmpty()||current!=session||!valid(session.id))return;
            JSObject result=new JSObject();result.put("token",session.token);result.put("text",text);
            notifyListeners("result",result);
        }catch(Exception ignored){}
    }
    private void fail(Session session,String reason){
        if(current!=session||!epoch.compareAndSet(session.id,session.id+1))return;
        JSObject out=new JSObject();out.put("token",session.token);out.put("message",reason);
        notifyListeners("error",out);
        try{worker.execute(()->close(session));}catch(RejectedExecutionException ignored){}
    }
    private void close(Session session){
        if(session==null||current!=session)return;
        current=null;
        if(session.service!=null){try{session.service.cancel();}catch(Exception ignored){}try{session.service.shutdown();}catch(Exception ignored){}}
        if(session.recognizer!=null)try{session.recognizer.close();}catch(Exception ignored){}
        if(session.model!=null)try{session.model.close();}catch(Exception ignored){}
    }
    private long invalidate(){return epoch.incrementAndGet();}
    private void closeBefore(long limit){Session s=current;if(s!=null&&s.id<limit)close(s);}
    @PluginMethod public void stop(PluginCall call){
        long limit=invalidate();submit(call,()->{closeBefore(limit);call.resolve();});
    }
    @Override protected void handleOnPause(){
        foreground=false;long limit=invalidate();
        try{worker.execute(()->closeBefore(limit));}catch(RejectedExecutionException ignored){}
    }
    @Override protected void handleOnResume(){foreground=true;}
    @Override protected void handleOnDestroy(){
        destroyed=true;foreground=false;long limit=invalidate();
        try{worker.execute(()->closeBefore(limit));}catch(RejectedExecutionException ignored){}
        worker.shutdown();
    }
}
