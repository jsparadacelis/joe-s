"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { ApiError } from "@/lib/api";
import { qualificationLabel, roleLabel } from "@/lib/me";
import { MEMBER_QUALIFICATIONS, MEMBER_ROLES, inviteMember, isValidEmail, type Member, type MemberInvitation } from "@/lib/members";

export interface InviteButtonProps {
  inviter?: (invitation: MemberInvitation) => Promise<Member>;
  clipboard?: { writeText(text: string): Promise<void> };
}

const DEFAULT_ROLE = "architect";
const EMAIL_MESSAGE = "Escribe un correo electrónico válido.";
const UNEXPECTED_MESSAGE = "Ocurrió un error inesperado. Inténtalo de nuevo.";
const INPUT_CLASS = "w-full rounded-base border bg-surface px-2.5 py-1.5 text-s text-ink";
const FOCUS_CLASS = "focus-visible:outline-2 focus-visible:outline-point";
const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary";

const defaultInviter = (invitation: MemberInvitation) => inviteMember(invitation);

/** Focusable elements of the dialog that are actually reachable (not inside a closed <details>). */
function reachable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    const details = el.closest("details");
    return !details || details.open || el.tagName === "SUMMARY";
  });
}

export function InviteButton({ inviter = defaultInviter, clipboard }: InviteButtonProps) {
  const titleId = useId();
  const emailId = useId();
  const emailErrorId = useId();
  const roleId = useId();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(DEFAULT_ROLE);
  const [qualifications, setQualifications] = useState<string[]>([]);
  const [emailError, setEmailError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [createdEmail, setCreatedEmail] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [round, setRound] = useState(0);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);
  const copyRef = useRef<HTMLButtonElement | null>(null);
  const messageRef = useRef<HTMLTextAreaElement | null>(null);
  const alertRef = useRef<HTMLDivElement | null>(null);
  const submitting = useRef(false);

  const message = createdEmail
    ? `Hola, te he invitado a RGB Proyectos. Entra con Google con este correo (${createdEmail}): ${window.location.origin}`
    : "";

  // Focus the email when the form shows (open or restart) and the copy button on the success step.
  useEffect(() => {
    if (!open) return;
    (createdEmail ? copyRef.current : emailRef.current)?.focus();
  }, [open, createdEmail, round]);

  function resetForm() {
    setEmail("");
    setRole(DEFAULT_ROLE);
    setQualifications([]);
    setEmailError(undefined);
    setFormError(undefined);
    setCreatedEmail(null);
    setCopyState("idle");
    setRound((n) => n + 1);
  }

  function openDialog() {
    resetForm();
    setOpen(true);
  }

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const items = reachable(dialogRef.current);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialogRef.current.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialogRef.current.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  function toggleQualification(code: string) {
    setQualifications((current) => (current.includes(code) ? current.filter((c) => c !== code) : [...current, code]));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    setFormError(undefined);
    if (!isValidEmail(email)) {
      setEmailError(EMAIL_MESSAGE);
      emailRef.current?.focus();
      return;
    }
    setEmailError(undefined);
    submitting.current = true;
    setSending(true);
    const invitedEmail = email.trim();
    try {
      await inviter({ email: invitedEmail, role, qualifications });
      setCreatedEmail(invitedEmail);
    } catch (error) {
      const text = error instanceof ApiError ? error.message : UNEXPECTED_MESSAGE;
      if (error instanceof ApiError && (error.code === "invalid_email" || error.code === "member_already_exists")) {
        setEmailError(text);
        emailRef.current?.focus();
      } else {
        setFormError(text);
        // The alert is rendered on the next commit; focus it after it exists.
        setTimeout(() => alertRef.current?.focus(), 0);
      }
    } finally {
      submitting.current = false;
      setSending(false);
    }
  }

  async function copy() {
    try {
      await (clipboard ?? navigator.clipboard).writeText(message);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
      messageRef.current?.select();
    }
  }

  const dialog = open ? (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 px-4 pt-24">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className="w-full max-w-md rounded-base border border-hair bg-surface p-5 text-ink"
      >
        <h2 id={titleId} className="mb-3 text-l font-medium">
          Invitar a alguien
        </h2>
        {createdEmail ? (
          <div className="flex flex-col gap-3">
            <Notice tone="ok">Invitación creada para {createdEmail}.</Notice>
            <p className="text-s text-muted">La plataforma no envía el aviso: mándale este mensaje tú.</p>
            <label htmlFor={`${emailId}-message`} className="text-s font-medium">
              Mensaje para copiar
            </label>
            <textarea
              id={`${emailId}-message`}
              ref={messageRef}
              readOnly
              rows={4}
              value={message}
              className={`${INPUT_CLASS} ${FOCUS_CLASS}`}
            />
            {copyState === "copied" ? <p className="text-s text-ok">Mensaje copiado</p> : null}
            {copyState === "failed" ? <p className="text-s text-bad">No se pudo copiar. Selecciona el texto y cópialo.</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button ref={copyRef} variant="primary" onClick={copy}>
                Copiar mensaje
              </Button>
              <Button onClick={resetForm}>Invitar a otra persona</Button>
              <Button onClick={close}>Cerrar</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-3">
            {formError ? (
              <Notice tone="bad" ref={alertRef} tabIndex={-1}>
                {formError}
              </Notice>
            ) : null}
            <div className="flex flex-col gap-1">
              <label htmlFor={emailId} className="text-s font-medium">
                Correo electrónico
              </label>
              <input
                id={emailId}
                ref={emailRef}
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? emailErrorId : undefined}
                className={`${INPUT_CLASS} ${emailError ? "border-bad" : "border-hair"} ${FOCUS_CLASS}`}
              />
              {emailError ? (
                <p id={emailErrorId} className="text-s text-bad">
                  {emailError}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={roleId} className="text-s font-medium">
                Rol
              </label>
              <select
                id={roleId}
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className={`${INPUT_CLASS} border-hair ${FOCUS_CLASS}`}
              >
                {MEMBER_ROLES.map((code) => (
                  <option key={code} value={code}>
                    {roleLabel(code)}
                  </option>
                ))}
              </select>
            </div>
            <details key={round} className="text-s">
              <summary className={`cursor-pointer text-muted ${FOCUS_CLASS}`}>Más opciones</summary>
              <fieldset className="mt-2 flex flex-col gap-1.5">
                <legend className="sr-only">Cualificaciones</legend>
                {MEMBER_QUALIFICATIONS.map((code) => (
                  <label key={code} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={qualifications.includes(code)}
                      onChange={() => toggleQualification(code)}
                      className="accent-point"
                    />
                    {qualificationLabel(code)}
                  </label>
                ))}
              </fieldset>
            </details>
            <div className="flex justify-end gap-2">
              <Button onClick={close}>Cancelar</Button>
              <Button type="submit" variant="primary" disabled={sending}>
                Invitar
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <Button ref={triggerRef} onClick={openDialog}>
        Invitar a alguien
      </Button>
      {dialog ? createPortal(dialog, document.body) : null}
    </>
  );
}
