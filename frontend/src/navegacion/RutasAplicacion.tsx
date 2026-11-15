// =============================================================================
// RutasAplicacion.tsx
// Qué hace:     une cada pantalla del mapa de rutas (configuracion/rutas.ts) con
//               su página, la protege con su capacidad y la coloca dentro del
//               marco de la aplicación (encabezado + menú).
// Depende de:   configuracion/rutas.ts, componentes/estructura/* y paginas/*.
// Lo usa:       App.tsx cuando hay sesión.
//
// PAGES es un Record<RouteId, ...>: si se agrega una pantalla al mapa y se
// olvida su página aquí, el compilador marca el error. Las páginas reales
// (paso 5c) van reemplazando las líneas "en construcción".
// =============================================================================
import type { ComponentType } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Estructura } from '../componentes/estructura/Estructura';
import { RutaProtegida } from '../componentes/estructura/RutaProtegida';
import { ROUTES, type RouteId } from '../configuracion/rutas';
import { PaginaEnConstruccion } from '../paginas/comunes/PaginaEnConstruccion';
import { PaginaNoEncontrada } from '../paginas/comunes/PaginaNoEncontrada';
import { PaginaInicio } from '../paginas/inicio/PaginaInicio';
import { PaginaUsuarios } from '../paginas/usuarios/PaginaUsuarios';

const PAGES: Record<RouteId, ComponentType> = {
  inicio: PaginaInicio,
  usuarios: PaginaUsuarios,
  sucursales: () => <PaginaEnConstruccion id="sucursales" />,
  auditoria: () => <PaginaEnConstruccion id="auditoria" />,
};

export function RutasAplicacion() {
  return (
    <Routes>
      <Route element={<Estructura />}>
        {ROUTES.map((route) => {
          const Page = PAGES[route.id];
          return (
            <Route
              key={route.id}
              path={route.path}
              element={
                <RutaProtegida capability={route.capability}>
                  <Page />
                </RutaProtegida>
              }
            />
          );
        })}
        {/* Cualquier otra dirección: aviso, dentro del mismo marco. */}
        <Route path="*" element={<PaginaNoEncontrada />} />
      </Route>
    </Routes>
  );
}
