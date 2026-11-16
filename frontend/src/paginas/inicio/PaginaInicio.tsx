// =============================================================================
// PaginaInicio.tsx
// Qué hace:     la pantalla de bienvenida. Arma tres tarjetas pequeñas con datos
//               que ya tiene la sesión: quién es la persona, los datos de la
//               sucursal activa y las secciones a las que puede entrar (que
//               cambian según su rol).
// Depende de:   ganchos/useSesion.ts, configuracion/rutas.ts, configuracion/roles.ts
//               y utilidades/formatoFecha.ts.
// Lo usa:       navegacion/RutasAplicacion.tsx (ruta "/").
//
// Los indicadores del día (citas, ventas...) están en el Panel de indicadores;
// esta pantalla no inventa números.
// =============================================================================
import { ArrowRight, Clock, MapPin, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EncabezadoPagina } from '../../componentes/ui/EncabezadoPagina';
import { Tarjeta } from '../../componentes/ui/Tarjeta';
import { ROLE_LABELS } from '../../configuracion/roles';
import { visibleSections } from '../../configuracion/rutas';
import { useSesion } from '../../ganchos/useSesion';
import { formatTime } from '../../utilidades/formatoFecha';

export function PaginaInicio() {
  const { user, activeBranch, can } = useSesion();
  if (user === null || activeBranch === null) return null;

  // Todas las pantallas que puede abrir, menos el propio Inicio.
  const accesos = visibleSections(can)
    .flatMap((section) => section.routes)
    .filter((route) => route.path !== '/');

  return (
    <div>
      <EncabezadoPagina
        title={`Bienvenido, ${user.full_name}`}
        description={`${ROLE_LABELS[user.role]} · ${activeBranch.name}`}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Tarjeta title="Su sesión">
          <dl className="space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-texto-suave">Nombre</dt>
              <dd>{user.full_name}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-texto-suave">Rol</dt>
              <dd>{ROLE_LABELS[user.role]}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-texto-suave">Correo</dt>
              <dd className="break-all">{user.email}</dd>
            </div>
          </dl>
        </Tarjeta>

        <Tarjeta title="Sucursal activa">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium">
            <span className="size-2.5 rounded-full bg-acento" aria-hidden="true" />
            {activeBranch.name}
          </p>
          <ul className="space-y-1 text-sm text-texto-suave">
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{activeBranch.address ?? 'Sin dirección registrada'}</span>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="size-4 shrink-0" aria-hidden="true" />
              <span>{activeBranch.phone ?? 'Sin teléfono registrado'}</span>
            </li>
            <li className="flex items-center gap-2">
              <Clock className="size-4 shrink-0" aria-hidden="true" />
              <span>
                {formatTime(activeBranch.opening_time)} a {formatTime(activeBranch.closing_time)}
              </span>
            </li>
          </ul>
          <p className="mt-2 text-sm text-texto-suave">
            Mostrador de óptica: {activeBranch.has_optical_counter ? 'sí' : 'no'}
          </p>
        </Tarjeta>

        <Tarjeta title="Secciones disponibles para su rol" className="md:col-span-2">
          {accesos.length === 0 ? (
            <p className="text-sm text-texto-suave">
              Por ahora no hay secciones disponibles para su rol. Los módulos clínicos y de óptica llegan en los
              próximos incrementos.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {accesos.map((route) => (
                <li key={route.id}>
                  <Link
                    to={route.path}
                    className="group flex items-start gap-3 rounded-md border border-borde p-3 transition-colors hover:bg-apoyo"
                  >
                    <route.icon className="mt-0.5 size-5 shrink-0 text-titulo" aria-hidden="true" />
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-titulo">{route.label}</span>
                      <span className="block text-sm text-texto-suave">{route.description}</span>
                    </span>
                    <ArrowRight
                      className="mt-0.5 size-4 shrink-0 text-texto-suave transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
