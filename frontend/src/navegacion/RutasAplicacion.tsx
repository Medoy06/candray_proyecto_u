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
import { RECORD_ROUTE, ROUTES, type RouteId } from '../configuracion/rutas';
import { PaginaNoEncontrada } from '../paginas/comunes/PaginaNoEncontrada';
import { PaginaAuditoria } from '../paginas/auditoria/PaginaAuditoria';
import { PaginaCitas } from '../paginas/citas/PaginaCitas';
import { PaginaExpediente } from '../paginas/expediente/PaginaExpediente';
import { PaginaInicio } from '../paginas/inicio/PaginaInicio';
import { PaginaOrdenesOptica } from '../paginas/ordenes/PaginaOrdenesOptica';
import { PaginaPanel } from '../paginas/panel/PaginaPanel';
import { PaginaRecordatorios } from '../paginas/recordatorios/PaginaRecordatorios';
import { PaginaPacientes } from '../paginas/pacientes/PaginaPacientes';
import { PaginaSucursales } from '../paginas/sucursales/PaginaSucursales';
import { PaginaUsuarios } from '../paginas/usuarios/PaginaUsuarios';

const PAGES: Record<RouteId, ComponentType> = {
  inicio: PaginaInicio,
  pacientes: PaginaPacientes,
  citas: PaginaCitas,
  panel: PaginaPanel,
  recordatorios: PaginaRecordatorios,
  'ordenes-optica': PaginaOrdenesOptica,
  usuarios: PaginaUsuarios,
  sucursales: PaginaSucursales,
  auditoria: PaginaAuditoria,
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
        {/* El expediente de un paciente: no está en el menú (se abre desde Pacientes). */}
        <Route
          path={RECORD_ROUTE.path}
          element={
            <RutaProtegida capability={RECORD_ROUTE.capability}>
              <PaginaExpediente />
            </RutaProtegida>
          }
        />
        {/* Cualquier otra dirección: aviso, dentro del mismo marco. */}
        <Route path="*" element={<PaginaNoEncontrada />} />
      </Route>
    </Routes>
  );
}
