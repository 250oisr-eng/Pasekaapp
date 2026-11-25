// Strictly synthetic Windows PowerShell 5.1 harness. NEVER use against a device.
using System;
using System.IO;
using System.Text;
class MockAdb {
    static void Octal(byte[] b,int offset,int width,long n) {
        string s=Convert.ToString(n,8).PadLeft(width-1,'0')+"\0";
        byte[] x=Encoding.ASCII.GetBytes(s);
        Array.Copy(x,0,b,offset,x.Length);
    }
    static byte[] Tar(bool privatePath,bool corrupt) {
        byte[] b=new byte[1536];
        string name=privatePath?"./app_webview/Default/IndexedDB/synthetic":"public-synthetic";
        byte[] n=Encoding.ASCII.GetBytes(name);
        Array.Copy(n,0,b,0,n.Length);
        Octal(b,100,8,420);
        Octal(b,108,8,0); Octal(b,116,8,0);
        Octal(b,124,12,0); Octal(b,136,12,0);
        for(int i=148;i<156;i++) b[i]=(byte)' ';
        b[156]=(byte)'0';
        long sum=0;for(int i=0;i<512;i++)sum+=b[i];
        Octal(b,148,8,sum);
        if(corrupt)b[0]^=1;
        return b;
    }
    static int Main(string[] args) {
        string command=String.Join(" ",args);
        string mode=Environment.GetEnvironmentVariable("B01_MOCK_MODE") ?? "PASS";
        if(command=="version"){
            Console.WriteLine(mode=="OLD_ADB"?"Android Debug Bridge version 1.0.32":"Android Debug Bridge version 1.0.41");return 0;
        }
        if(command=="devices -l"){
            string stateDir=Environment.GetEnvironmentVariable("B01_MOCK_STATE_DIR") ?? Path.GetTempPath();
            string marker=Path.Combine(stateDir,"b01-device-started.flag");
            if(mode=="DAEMON_STARTUP_ONCE" && !File.Exists(marker)){
                File.WriteAllText(marker,"synthetic startup only");
                Console.Error.WriteLine("* daemon not running; starting now at tcp:5037");
                Console.Error.WriteLine("* daemon started successfully");
            }
            if(mode=="DEVICES_STARTUP_REPEAT"){
                Console.Error.WriteLine("* daemon not running; starting now at tcp:5037");
                Console.Error.WriteLine("* daemon started successfully");
            }
            if(mode=="DEVICES_UNKNOWN_STDERR")Console.Error.WriteLine("unknown and untrusted mock warning");
            if(mode=="DEVICES_EXIT_FAIL"){Console.Error.WriteLine("failed to connect");return 1;}
            Console.WriteLine("List of devices attached");
            if(mode=="DEVICES_UNAUTHORIZED")Console.WriteLine("MOCK123 unauthorized");
            else Console.WriteLine("MOCK123 device product:mock model:NE2213 device:mock");
            return 0;
        }
        if(command.EndsWith("shell getprop ro.product.model")){
            if(mode=="MODEL_FAIL"){Console.Error.WriteLine("synthetic read-only getprop failed");return 1;}
            Console.WriteLine("NE2213");return 0;
        }
        if(command.EndsWith("features")){Console.WriteLine(mode=="NO_SHELL_V2"?"stat_v2":"shell_v2,stat_v2");return 0;}
        if(command.EndsWith("shell run-as ru.paseka.journal pwd")){Console.WriteLine("/data/user/0/ru.paseka.journal");return 0;}
        if(command.EndsWith("shell ps -A")){
            Console.WriteLine("USER PID PPID VSZ RSS WCHAN ADDR S NAME");
            Console.WriteLine("root 1 0 0 0 0 0 S init");
            if(mode=="RUNNING")Console.WriteLine("u0_a1 112 1 0 0 0 0 S ru.paseka.journal");
            return 0;
        }
        if(command.Contains(" test -r /system/"))return 0;
        if(command.Contains(" tar -cf - ")){
            bool isPrivate=command.EndsWith(" tar -cf - .");
            bool bad=(mode=="BAD_HEADER" || (isPrivate && mode=="BAD_PRIVATE_HEADER"));
            byte[] bytes=Tar(isPrivate && mode!="BAD_COVERAGE",bad);
            // V14: reproduce an invalid public shell transport while exec-out succeeds,
            // without touching real devices or reading app-private data.
            bool isExecOut=command.Contains(" exec-out ");
            if(!isPrivate && (mode=="SHELL_EMPTY_TAR_EXEC_VALID" && !isExecOut ||
                              mode=="BOTH_PUBLIC_EMPTY_TAR")) {
                byte[] tail=Encoding.ASCII.GetBytes(("tar: synthetic public file denied").PadRight(66,'!'));
                bytes=new byte[1024+tail.Length];
                Array.Copy(tail,0,bytes,1024,tail.Length);
            }
            Stream output=Console.OpenStandardOutput();output.Write(bytes,0,bytes.Length);output.Flush();
            if(mode=="REMOTE_ERROR")Console.Error.WriteLine("synthetic remote diagnostic");
            return 0;
        }
        Console.Error.WriteLine("unknown synthetic command");
        return 127;
    }
}
