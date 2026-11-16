// =============================================================================
// SeccionInterconsultas.tsx
// Qué hace:     la sección "Interconsultas" del expediente: quién tiene acceso
//               temporal (vigente, vencido o revocado), "Dar interconsulta" y
//               "Revocar".
// Depende de:   ganchos/useInterconsultas.ts, useSesion.ts, componentes/ui,
//               servicios/interconsultas.ts y FormularioInterconsulta.tsx.
// Lo usa:       paginas/expediente/PaginaExpediente.tsx, solo cuando la persona
//               atiende al paciente y tiene la capacidad referrals_manage.
//
// Es una sección con su propia carga y sus propias ventanas, así la página del
// expediente no se llena de estado ajeno. Revocar solo se ofrece sobre las
// interconsultas VIGENTES que dio la misma persona; el servidor lo vuelve a exigir.
// =============================================================================
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { AlertaError } from '../../componentes/ui/AlertaError';
import { AlertaExito } from '../../componentes/ui/AlertaExito';
import { Boton } from '../../componentes/ui/Boton';
import { ConfirmDialog } from '../../componentes/ui/ConfirmDialog';
import { Etiqueta } from '../../componentes/ui/Etiqueta';
import { Tarjeta } from '../../componentes/ui/Tarjeta';
import { useInterconsultas } from '../../ganchos/useInterconsultas';
import { useSesion } from '../../ganchos/useSesion';
import { revokeReferral, type Referral, type ReferralStatus } from '../../servicios/interconsultas';
import { getApiErrorMessage } from '../../utilidades/errorApi';
import { formatDateTime } from '../../utilidades/formatoFecha';
import { FormularioInterconsulta } from './FormularioInterconsulta';

const STATUS: Record<ReferralStatus, { label: string; tone: 'exito' | 'neutro' | 'aviso' }> = {
  active: { label: 'Vigente', tone: 'exito' },
  expired: { label: 'Vencida', tone: 'neutro' },
  revoked: { label: 'Revocada', tone: 'aviso' },
};

export function SeccionInterconsultas({ patientId }: { patientId: string }) {
  const { user } = useSesion();
  const referrals = useInterconsultas(patientId);
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState<Referral | null>(null);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  function finish(message: string) {
    setGranting(false);
    setActionError('');
    setNotice(message);
    referrals.reload();
  }

  async function confirmRevoke() {
    const target = revoking;
    if (target === null) return;
    setRevoking(null); // se cierra de inmediato: evita un doble clic
    setNotice('');
    try {
      await revokeReferral(patientId, target.id);
      finish(`Se revocó el acceso de ${target.provider_name}.`);
    } catch (revokeError: unknown) {
      setActionError(getApiErrorMessage(revokeError, 'No se pudo revocar la interconsulta.'));
      referrals.reload(); // pudo haber vencido o revocarse mientras tanto
    }
  }

  return (
    <Tarjeta title="Interconsultas" className="mb-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="text-sm text-texto-suave">
          Acceso temporal, de solo lectura, que usted le da a otro médico sobre este expediente.
        </p>
        <Boton
          size="sm"
          className="ml-auto"
          onClick={() => {
            setNotice('');
            setActionError('');
            setGranting(true);
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          Dar interconsulta
        </Boton>
      </div>

      {notice !== '' && (
        <div className="mb-3">
          <AlertaExito message={notice} onClose={() => setNotice('')} />
        </div>
      )}
      {actionError !== '' && (
        <div className="mb-3">
          <AlertaError message={actionError} />
        </div>
      )}
      {referrals.status === 'error' && (
        <div className="space-y-3">
          <AlertaError message={referrals.error ?? 'No se pudieron cargar las interconsultas.'} />
          <Boton variant="secundario" onClick={referrals.reload}>
            Reintentar
          </Boton>
        </div>
      )}
      {referrals.status === 'loading' && referrals.data === null && (
        <p className="text-sm text-texto-suave">Cargando interconsultas...</p>
      )}
      {referrals.data !== null && referrals.data.length === 0 && (
        <p className="text-sm text-texto-suave">Nadie más tiene acceso a este expediente.</p>
      )}
      {referrals.data !== null && referrals.data.length > 0 && (
        <ul aria-label="Interconsultas del paciente" className="divide-y divide-borde">
          {referrals.data.map((referral) => (
            <li key={referral.id} className="flex flex-wrap items-start gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-titulo">{referral.provider_name}</span>
                  <Etiqueta tone={STATUS[referral.status].tone}>{STATUS[referral.status].label}</Etiqueta>
                </p>
                <p className="text-sm text-texto">{referral.reason}</p>
                <p className="text-xs text-texto-suave">
                  Dada por {referral.granted_by_name} el {formatDateTime(referral.created_at)} · vence el{' '}
                  {formatDateTime(referral.expires_at)}
                  {referral.revoked_at !== null && ` · revocada el ${formatDateTime(referral.revoked_at)}`}
                </p>
              </div>
              {referral.status === 'active' && referral.granted_by === user?.id && (
                <Boton
                  size="sm"
                  variant="peligro"
                  onClick={() => setRevoking(referral)}
                  aria-label={`Revocar el acceso de ${referral.provider_name}`}
                >
                  Revocar
                </Boton>
              )}
            </li>
          ))}
        </ul>
      )}

      {granting && (
        <FormularioInterconsulta
          patientId={patientId}
          onClose={() => setGranting(false)}
          onSaved={(referral) => finish(`Interconsulta dada a ${referral.provider_name}.`)}
        />
      )}
      <ConfirmDialog
        isOpen={revoking !== null}
        title="Revocar interconsulta"
        message={`${revoking?.provider_name ?? ''} dejará de poder ver este expediente de inmediato.`}
        confirmLabel="Revocar"
        danger
        onConfirm={() => void confirmRevoke()}
        onCancel={() => setRevoking(null)}
      />
    </Tarjeta>
  );
}
