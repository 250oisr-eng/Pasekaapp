package ru.paseka.beedetector;

import android.content.Context;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;

/**
 * Probes the bundled LiteRT runtime without introducing a Kotlin compiler
 * requirement into the Capacitor plugin module. The public CompiledModel API
 * is Kotlin-first; this bridge resolves Environment.create(Context) safely.
 */
final class LiteRtRuntimeProbe {
    static final class Result {
        final boolean available;

        Result(boolean available) {
            this.available = available;
        }
    }

    private LiteRtRuntimeProbe() {}

    static Result initializeAndClose(Context context) {
        Object environment = null;
        try {
            Class<?> environmentClass =
                Class.forName("com.google.ai.edge.litert.Environment");
            Method factory = findFactory(environmentClass);
            Object receiver = null;
            if (!Modifier.isStatic(factory.getModifiers())) {
                Field companionField = environmentClass.getField("Companion");
                receiver = companionField.get(null);
            }

            environment = factory.invoke(receiver, context.getApplicationContext());
            if (environment == null) {
                return new Result(false);
            }

            Method close = environment.getClass().getMethod("close");
            close.invoke(environment);
            environment = null;
            return new Result(true);
        } catch (ReflectiveOperationException | LinkageError | RuntimeException error) {
            return new Result(false);
        } finally {
            if (environment != null) {
                try {
                    environment.getClass().getMethod("close").invoke(environment);
                } catch (ReflectiveOperationException | RuntimeException ignored) {
                    // Best-effort cleanup after a failed probe.
                }
            }
        }
    }

    private static Method findFactory(Class<?> environmentClass)
        throws NoSuchMethodException {
        try {
            return environmentClass.getMethod("create", Context.class);
        } catch (NoSuchMethodException noStaticFactory) {
            Class<?> companionClass = Class.forName(
                environmentClass.getName() + "$Companion");
            return companionClass.getMethod("create", Context.class);
        }
    }
}
