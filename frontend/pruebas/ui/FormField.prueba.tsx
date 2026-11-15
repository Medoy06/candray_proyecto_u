// =============================================================================
// FormField.prueba.tsx y Boton: pruebas de los componentes básicos de formulario.
// Qué prueba:   la etiqueta queda unida al campo, el asterisco no ensucia el
//               nombre accesible, la ayuda se muestra, y Boton es type="button"
//               por defecto (para que no envíe formularios sin querer).
// =============================================================================
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Boton } from '../../src/componentes/ui/Boton';
import { FormField, inputClass } from '../../src/componentes/ui/FormField';

describe('FormField', () => {
  it('une la etiqueta con su campo', () => {
    render(<FormField label="Nombre"><input className={inputClass} /></FormField>);
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument();
  });

  it('el asterisco de obligatorio es solo visual: el nombre accesible queda limpio', () => {
    render(<FormField label="Correo" required><input required /></FormField>);
    // getByRole calcula el nombre accesible real: ahí el asterisco (aria-hidden) no cuenta.
    expect(screen.getByRole('textbox', { name: 'Correo' })).toBeRequired();
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true');
  });

  it('muestra la ayuda cuando se da', () => {
    render(<FormField label="Clave" hint="Mínimo 8 caracteres."><input /></FormField>);
    expect(screen.getByText('Mínimo 8 caracteres.')).toBeInTheDocument();
  });
});

describe('Boton', () => {
  it('es type="button" por defecto', () => {
    render(<Boton>Ir</Boton>);
    expect(screen.getByRole('button', { name: 'Ir' })).toHaveAttribute('type', 'button');
  });

  it('acepta type="submit" cuando se pide', () => {
    render(<Boton type="submit">Enviar</Boton>);
    expect(screen.getByRole('button', { name: 'Enviar' })).toHaveAttribute('type', 'submit');
  });
});
