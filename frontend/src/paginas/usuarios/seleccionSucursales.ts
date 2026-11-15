// =============================================================================
// seleccionSucursales.ts
// Qué hace:     la lógica (sin pantalla) de elegir las sucursales de un usuario:
//               cuáles están marcadas y cuál es la predeterminada.
// Lo usan:      paginas/usuarios/SelectorSucursales.tsx y los formularios.
//
// Regla: la predeterminada siempre es una de las marcadas. Al marcar la primera,
// pasa a ser la predeterminada; si se desmarca la predeterminada, lo pasa a ser
// la primera que quede; si no queda ninguna, no hay predeterminada.
// =============================================================================
export interface BranchSelection {
  ids: string[];            // sucursales marcadas, en el orden en que se marcaron
  defaultId: string | null; // la predeterminada (una de las marcadas) o null
}

export const EMPTY_SELECTION: BranchSelection = { ids: [], defaultId: null };

// Marca o desmarca una sucursal.
export function toggleBranch(selection: BranchSelection, id: string): BranchSelection {
  const ids = selection.ids.includes(id) ? selection.ids.filter((current) => current !== id) : [...selection.ids, id];
  const defaultStillValid = selection.defaultId !== null && ids.includes(selection.defaultId);
  return { ids, defaultId: defaultStillValid ? selection.defaultId : (ids[0] ?? null) };
}

// Elige la predeterminada. Solo se puede entre las marcadas; si no, no cambia nada.
export function setDefaultBranch(selection: BranchSelection, id: string): BranchSelection {
  return selection.ids.includes(id) ? { ...selection, defaultId: id } : selection;
}
