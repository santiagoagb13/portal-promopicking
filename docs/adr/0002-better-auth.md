# ADR 0002 · Better Auth con passkeys, enlace mágico e invitaciones

- Estado: aceptada (fase 1, 27/10/2026)
- Contexto: secciones 4.3 y 5 del plan.

## Decisión

Better Auth 1.7 con el plugin `@better-auth/passkey` (WebAuthn, SimpleWebAuthn por debajo), el plugin de enlace mágico y sesiones en Postgres a través del adaptador de Drizzle. Sin contraseñas (`emailAndPassword` desactivado) y sin registro abierto (`disableSignUp` en el enlace mágico y rutas de alta desactivadas).

## Cómo encaja con el plan

| Requisito del plan                                                                      | Implementación                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Token de invitación de 256 bits, solo hash en BD                                        | `invitation-token.ts`: 32 bytes aleatorios en base64url; se guarda el SHA-256                                                                                                                                                                                                                            |
| Registrar la passkey crea la cuenta, usa la invitación y abre sesión en una transacción | El plugin de passkeys admite registro sin sesión (`registration.requireSession: false`) con `resolveUser` y `afterVerification`. `afterVerification` llama a `acceptInvitation()` y Better Auth guarda la passkey y crea la sesión dentro de la misma transacción (`createSession: true`). Ver más abajo |
| Enlace mágico de 10 min, un solo uso, hash en BD                                        | `expiresIn: 600`, `storeToken: 'hashed'`; Better Auth consume el token atómicamente                                                                                                                                                                                                                      |
| Respuesta que no revela si el correo existe                                             | La acción de `/acceso` responde igual y tarda al menos 900 ms exista o no la cuenta; `sendMagicLink` no envía nada si no hay cuenta activa                                                                                                                                                               |
| Límite de intentos por IP y por cuenta                                                  | Propio, en Postgres (`rate_limits`), aplicado en `hooks.server.ts` a las rutas de acceso, invitación, enlace mágico y passkeys, más un límite por correo en la acción de enlace                                                                                                                          |
| Cookies `HttpOnly`, `Secure`, `SameSite=Lax`                                            | Por defecto en Better Auth; `Secure` y prefijo `__Secure-` cuando `AUTH_ORIGIN` es https                                                                                                                                                                                                                 |
| 12 h de inactividad, 30 días absoluta, 8 h para admin                                   | `session.expiresIn = 12 h` con renovación cada 15 min; los 30 días y las 8 h de admin se comprueban en `hooks.server.ts`, que revoca la sesión                                                                                                                                                           |

## Desviaciones y decisiones al implementar

1. **Transacción compartida.** El adaptador de Drizzle de Better Auth no expone la transacción. El cliente de BD (`db/client.ts`) envuelve `transaction()` y guarda la transacción en un `AsyncLocalStorage`; `currentDb()` la devuelve. Así `acceptInvitation()` escribe en la misma transacción que la passkey y la sesión. Lo cubre la prueba de integración «si algo falla al aceptar no queda nada a medias».
2. **Tabla `accounts`.** Better Auth la exige aunque no haya contraseñas ni proveedores externos. Se añade al esquema (el plan solo nombraba `sessions`, `passkeys` y `verifications`).
3. **Límite de intentos propio.** El limitador integrado de Better Auth se desactiva para tener uno solo, compartido entre instancias (Postgres) y que cubre también las rutas propias (invitación, acceso).
4. **`requireSession: false` es global.** Con sesión, el plugin usa la sesión (añadir passkey desde Cuenta); sin sesión, `resolveUser` exige una invitación válida, así que no se puede registrar una passkey suelta.
5. **Respaldo sin passkeys en la invitación.** «Recibir enlace de acceso» acepta la invitación (el enlace llegó al correo invitado) y envía un enlace mágico; luego se ofrece registrar la passkey en `/bienvenida`.
6. **Rutas desactivadas**: `/update-user`, `/change-email`, `/delete-user`, `/list-accounts`, `/sign-up/email`. Los cambios de nombre o rol irán por acciones propias auditadas (fase 2).
7. **Auditoría.** Accesos (passkey y enlace), cierre de sesión, sesiones revocadas o caducadas, passkeys añadidas, renombradas y eliminadas, e invitaciones creadas, reenviadas, revocadas y aceptadas. El servicio de cambio de rol llega con la administración de usuarios (fase 2), que es la primera pantalla que lo permite.

## Alternativa descartada

Implementación propia siguiendo la guía de Lucia con Oslo: más control, pero WebAuthn, sesiones y enlaces mágicos con código propio que auditar.
