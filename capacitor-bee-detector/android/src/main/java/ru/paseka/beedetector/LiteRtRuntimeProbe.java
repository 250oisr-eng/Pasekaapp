package ru.paseka.beedetector;

import android.content.Context;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.Collections;
import java.util.Map;

/**
 * Smoke-tests the bundled standalone LiteRT Environment API.
 * This deliberately does not load a model or claim inference availability.
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
            if (!Modifier.isStatic(factory.getModifiers())) {
                return new Result(false);
            }

            // Standalone LiteRT exposes create(Context, Map, boolean), or create(Map).
            if (factory.getParameterTypes().length == 3) {
                environment = factory.invoke(
                    null, context.getApplicationContext(), Collections.emptyMap(), false
                );
            } else {
                environment = factory.invoke(null, Collections.emptyMap());
            }
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
        throws ReflectiveOperationException {
        try {
            return environmentClass.getMethod(
                "create", Context.class, Map.class, boolean.class
            );
        } catch (NoSuchMethodException noContextFactory) {
            return environmentClass.getMethod("create", Map.class);
        }
    }
}
