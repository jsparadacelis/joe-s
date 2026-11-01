"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { StatusChip, type StatusTone } from "@/components/ui/StatusChip";
import { Table, type TableColumn } from "@/components/ui/Table";
import { ApiError } from "@/lib/api";
import { qualificationLabel, roleLabel } from "@/lib/me";
import {
  MEMBER_QUALIFICATIONS,
  MEMBER_ROLES,
  fetchMembers,
  inviteMember,
  isValidEmail,
  revokeMember,
  statusLabel,
  type Member,
  type MemberInvitation,
  type MemberStatus,
} from "@/lib/members";

export interface TeamEditorProps {
  fetcher?: () => Promise<Member[]>;
  inviter?: (invitation: MemberInvitation) => Promise<Member>;
  revoker?: (id: string) => Promise<Member>;
}

const HELP =
  "La persona invitada no recibe nada de la plataforma: se activa al entrar con Google con el correo con el que la inviten.";
const UNEXPECTED_MESSAGE = "Ocurrió un error inesperado. Inténtalo de nuevo.";
const EMAIL_MESSAGE = "Escribe un correo electrónico válido.";
const ROLE_MESSAGE = "Elige un rol.";
const INVITED_MESSAGE = "Invitación creada. La persona se activa al entrar con Google con este correo.";
const INPUT_CLASS = "w-full rounded-base border bg-surface px-2.5 py-1.5 text-s text-ink";
const FOCUS_CLASS = "focus-visible:outline-2 focus-visible:outline-point";

const STATUS_TONES: Record<MemberStatus, StatusTone> = { invited: "warn", active: "ok", revoked: "off" };

const defaultFetcher = () => fetchMembers();
const defaultInviter = (invitation: MemberInvitation) => inviteMember(invitation);
const defaultRevoker = (id: string) => revokeMember(id);

const errorMessage = (error: unknown) => (error instanceof ApiError ? error.message : UNEXPECTED_MESSAGE);

export function TeamEditor({ fetcher = defaultFetcher, inviter = defaultInviter, revoker = defaultRevoker }: TeamEditorProps) {
  const idPrefix = useId();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [, setFocusTick] = useState(0);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [qualifications, setQualifications] = useState<string[]>([]);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [roleError, setRoleError] = useState<string | undefined>();
  const [inviteError, setInviteError] = useState<string | undefined>();
  const [inviting, setInviting] = useState(false);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | undefined>();
  const [announcement, setAnnouncement] = useState("");

  const emailRef = useRef<HTMLInputElement | null>(null);
  const roleRef = useRef<HTMLSelectElement | null>(null);
  const inviteAlertRef = useRef<HTMLDivElement | null>(null);
  const revokeAlertRef = useRef<HTMLDivElement | null>(null);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const revokeButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const pendingFocus = useRef<(() => void) | null>(null);
  const revoking = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetcher().then(
      (list) => {
        if (cancelled) return;
        setMembers(list);
        setListError(null);
      },
      (error: unknown) => {
        if (!cancelled) setListError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [fetcher, attempt]);

  // Focus moves requested by handlers run once the new DOM exists.
  useEffect(() => {
    const move = pendingFocus.current;
    if (!move) return;
    pendingFocus.current = null;
    move();
  });

  const reload = useCallback(async () => {
    try {
      const list = await fetcher();
      if (!mounted.current) return;
      setMembers(list);
      setListError(null);
    } catch (error) {
      if (mounted.current) setListError(errorMessage(error));
    }
  }, [fetcher]);

  const retry = () => {
    setListError(null);
    setAttempt((n) => n + 1);
  };

  function edited() {
    setAnnouncement("");
    setInviteError(undefined);
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inviting) return;
    const nextEmailError = isValidEmail(email) ? undefined : EMAIL_MESSAGE;
    const nextRoleError = role === "" ? ROLE_MESSAGE : undefined;
    setEmailError(nextEmailError);
    setRoleError(nextRoleError);
    setInviteError(undefined);
    setAnnouncement("");
    if (nextEmailError || nextRoleError) {
      (nextEmailError ? emailRef.current : roleRef.current)?.focus();
      return;
    }

    setInviting(true);
    try {
      await inviter({ email: email.trim(), role, qualifications });
      setEmail("");
      setRole("");
      setQualifications([]);
      setAnnouncement(INVITED_MESSAGE);
      emailRef.current?.focus();
      await reload();
    } catch (error) {
      const message = errorMessage(error);
      if (error instanceof ApiError && (error.code === "invalid_email" || error.code === "member_already_exists")) {
        setEmailError(message);
        emailRef.current?.focus();
      } else {
        setInviteError(message);
        pendingFocus.current = () => inviteAlertRef.current?.focus();
      }
    } finally {
      if (mounted.current) setInviting(false);
    }
  }

  function askToRevoke(id: string) {
    setRevokeError(undefined);
    setAnnouncement("");
    setConfirmingId(id);
    pendingFocus.current = () => confirmRef.current?.focus();
  }

  function cancelRevoke(id: string) {
    setConfirmingId(null);
    pendingFocus.current = () => revokeButtons.current[id]?.focus();
  }

  async function confirmRevoke(member: Member) {
    if (revoking.current) return;
    revoking.current = true;
    try {
      await revoker(member.id);
      setConfirmingId(null);
      setAnnouncement(`Acceso retirado a ${member.email}.`);
      await reload();
      pendingFocus.current = () => tableWrapRef.current?.focus();
    } catch (error) {
      setConfirmingId(null);
      setRevokeError(errorMessage(error));
      pendingFocus.current = () => revokeAlertRef.current?.focus();
    } finally {
      revoking.current = false;
      // Re-render so the pending focus move runs even if no state changed.
      if (mounted.current) setFocusTick((n) => n + 1);
    }
  }

  function onConfirmKeyDown(event: KeyboardEvent<HTMLElement>, id: string) {
    if (event.key === "Escape") cancelRevoke(id);
  }

  const columns: TableColumn<Member>[] = [
    { key: "email", header: "Correo", render: (m) => m.email },
    { key: "role", header: "Rol", render: (m) => roleLabel(m.role) },
    {
      key: "qualifications",
      header: "Cualificaciones",
      render: (m) => (m.qualifications.length > 0 ? m.qualifications.map(qualificationLabel).join(", ") : "—"),
    },
    {
      key: "status",
      header: "Estado",
      render: (m) => <StatusChip tone={STATUS_TONES[m.status] ?? "neutral"}>{statusLabel(m.status)}</StatusChip>,
    },
    {
      key: "actions",
      header: "Acciones",
      render: (m) => {
        if (m.status === "revoked") return <span className="text-muted">—</span>;
        if (confirmingId === m.id) {
          return (
            <span className="inline-flex gap-2" onKeyDown={(e) => onConfirmKeyDown(e, m.id)}>
              <Button ref={confirmRef} variant="primary" size="sm" aria-label={`Confirmar retiro de ${m.email}`} onClick={() => confirmRevoke(m)}>
                Confirmar
              </Button>
              <Button size="sm" onClick={() => cancelRevoke(m.id)}>
                Cancelar
              </Button>
            </span>
          );
        }
        return (
          <Button
            ref={(el) => {
              revokeButtons.current[m.id] = el;
            }}
            size="sm"
            aria-label={`Retirar acceso de ${m.email}`}
            onClick={() => askToRevoke(m.id)}
          >
            Retirar acceso
          </Button>
        );
      },
    },
  ];

  const emailErrorId = `${idPrefix}-email-error`;
  const roleErrorId = `${idPrefix}-role-error`;

  return (
    <Panel title="Equipo del estudio" description={HELP}>
      {listError ? (
        <div className="flex flex-col items-start gap-3">
          <Notice tone="bad">{listError}</Notice>
          <Button onClick={retry}>Reintentar</Button>
        </div>
      ) : null}
      {members === null && !listError ? <p className="text-s text-muted">Cargando el equipo…</p> : null}

      {revokeError ? (
        <Notice tone="bad" ref={revokeAlertRef} tabIndex={-1}>
          {revokeError}
        </Notice>
      ) : null}

      {members !== null && members.length === 0 ? (
        <p className="text-s text-muted">Todavía no hay personas en el equipo.</p>
      ) : null}
      {members !== null && members.length > 0 ? (
        <div ref={tableWrapRef} tabIndex={-1} className={`overflow-x-auto ${FOCUS_CLASS}`}>
          <Table caption="Equipo del estudio" columns={columns} rows={members} getRowKey={(m) => m.id} />
        </div>
      ) : null}

      {members !== null ? (
        <form aria-label="Invitar a una persona" aria-busy={inviting} noValidate onSubmit={handleInvite} className="flex flex-col gap-4">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-2.5">
            <div className="flex flex-col gap-1">
              <label className="flex flex-col gap-1 text-xs text-muted">
                <span>Correo electrónico</span>
                <input
                  ref={emailRef}
                  type="email"
                  autoComplete="off"
                  className={`${INPUT_CLASS} ${emailError ? "border-bad" : "border-hair"}`}
                  value={email}
                  onChange={(e) => {
                    edited();
                    setEmailError(undefined);
                    setEmail(e.target.value);
                  }}
                  aria-invalid={emailError ? true : undefined}
                  aria-describedby={emailError ? emailErrorId : undefined}
                />
              </label>
              {emailError ? (
                <p id={emailErrorId} role="alert" className="text-s text-bad">
                  {emailError}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <label className="flex flex-col gap-1 text-xs text-muted">
                <span>Rol</span>
                <select
                  ref={roleRef}
                  className={`${INPUT_CLASS} ${roleError ? "border-bad" : "border-hair"}`}
                  value={role}
                  onChange={(e) => {
                    edited();
                    setRoleError(undefined);
                    setRole(e.target.value);
                  }}
                  aria-invalid={roleError ? true : undefined}
                  aria-describedby={roleError ? roleErrorId : undefined}
                >
                  <option value="">Selecciona un rol</option>
                  {MEMBER_ROLES.map((code) => (
                    <option key={code} value={code}>
                      {roleLabel(code)}
                    </option>
                  ))}
                </select>
              </label>
              {roleError ? (
                <p id={roleErrorId} role="alert" className="text-s text-bad">
                  {roleError}
                </p>
              ) : null}
            </div>
          </div>

          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-1 text-xs text-muted">Cualificaciones</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {MEMBER_QUALIFICATIONS.map((code) => (
                <label key={code} className="flex items-center gap-2 text-s text-ink">
                  <input
                    type="checkbox"
                    checked={qualifications.includes(code)}
                    onChange={(e) => {
                      edited();
                      setQualifications((current) => (e.target.checked ? [...current, code] : current.filter((q) => q !== code)));
                    }}
                  />
                  {qualificationLabel(code)}
                </label>
              ))}
            </div>
          </fieldset>

          {inviteError ? (
            <Notice tone="bad" ref={inviteAlertRef} tabIndex={-1}>
              {inviteError}
            </Notice>
          ) : null}

          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" size="sm" disabled={inviting}>
              Invitar
            </Button>
          </div>
        </form>
      ) : null}
      <div role="status" className="text-s text-ok">
        {announcement}
      </div>
    </Panel>
  );
}
