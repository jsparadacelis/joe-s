"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { Table, type TableColumn } from "@/components/ui/Table";
import { ApiError } from "@/lib/api";
import { fetchMembers, type Member } from "@/lib/members";
import {
  PROJECT_ROLES,
  assignProjectRole,
  buildTeamRows,
  fetchProjectTeam,
  projectRoleLabel,
  requiredQualificationLabel,
  unassignProjectRole,
  type ProjectAssignment,
  type TeamRow,
} from "@/lib/project-team";

export interface ProjectTeamEditorProps {
  code: string;
  teamFetcher?: (code: string) => Promise<ProjectAssignment[]>;
  membersFetcher?: () => Promise<Member[]>;
  assigner?: (code: string, memberId: string, role: string) => Promise<ProjectAssignment>;
  unassigner?: (code: string, assignmentId: string) => Promise<ProjectAssignment>;
}

const UNEXPECTED_MESSAGE = "Ocurrió un error inesperado. Inténtalo de nuevo.";
const PERSON_MESSAGE = "Elige una persona.";
const ROLE_MESSAGE = "Elige una función.";
const INPUT_CLASS = "w-full rounded-base border bg-surface px-2.5 py-1.5 text-s text-ink";
const FOCUS_CLASS = "focus-visible:outline-2 focus-visible:outline-point";

const defaultTeamFetcher = (code: string) => fetchProjectTeam(code);
const defaultMembersFetcher = () => fetchMembers();
const defaultAssigner = (code: string, memberId: string, role: string) => assignProjectRole(code, memberId, role);
const defaultUnassigner = (code: string, assignmentId: string) => unassignProjectRole(code, assignmentId);

const errorMessage = (error: unknown) => (error instanceof ApiError ? error.message : UNEXPECTED_MESSAGE);

export function ProjectTeamEditor({
  code,
  teamFetcher = defaultTeamFetcher,
  membersFetcher = defaultMembersFetcher,
  assigner = defaultAssigner,
  unassigner = defaultUnassigner,
}: ProjectTeamEditorProps) {
  const idPrefix = useId();
  const [team, setTeam] = useState<ProjectAssignment[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [, setFocusTick] = useState(0);

  const [memberId, setMemberId] = useState("");
  const [role, setRole] = useState("");
  const [personError, setPersonError] = useState<string | undefined>();
  const [roleError, setRoleError] = useState<string | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  const [assigning, setAssigning] = useState(false);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const personRef = useRef<HTMLSelectElement | null>(null);
  const roleRef = useRef<HTMLSelectElement | null>(null);
  const alertRef = useRef<HTMLDivElement | null>(null);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const removeButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const pendingFocus = useRef<(() => void) | null>(null);
  const removing = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([teamFetcher(code), membersFetcher()]).then(
      ([assignments, people]) => {
        if (cancelled) return;
        setTeam(assignments);
        setMembers(people);
        setListError(null);
      },
      (error: unknown) => {
        if (!cancelled) setListError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [code, teamFetcher, membersFetcher, attempt]);

  // Focus moves requested by handlers run once the new DOM exists.
  useEffect(() => {
    const move = pendingFocus.current;
    if (!move) return;
    pendingFocus.current = null;
    move();
  });

  const reloadTeam = useCallback(async () => {
    try {
      const assignments = await teamFetcher(code);
      if (!mounted.current) return;
      setTeam(assignments);
      setListError(null);
    } catch (error) {
      if (mounted.current) setListError(errorMessage(error));
    }
  }, [code, teamFetcher]);

  const retry = () => {
    setListError(null);
    setAttempt((n) => n + 1);
  };

  function edited() {
    setAnnouncement("");
    setActionError(undefined);
  }

  const emailOf = (id: string) => members.find((m) => m.id === id)?.email ?? "";

  async function handleAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (assigning) return;
    const nextPersonError = memberId === "" ? PERSON_MESSAGE : undefined;
    const nextRoleError = role === "" ? ROLE_MESSAGE : undefined;
    setPersonError(nextPersonError);
    setRoleError(nextRoleError);
    setActionError(undefined);
    setAnnouncement("");
    if (nextPersonError || nextRoleError) {
      (nextPersonError ? personRef.current : roleRef.current)?.focus();
      return;
    }

    setAssigning(true);
    try {
      await assigner(code, memberId, role);
      const message = `Se asignó la función «${projectRoleLabel(role)}» a ${emailOf(memberId)}.`;
      setMemberId("");
      setRole("");
      setAnnouncement(message);
      personRef.current?.focus();
      await reloadTeam();
    } catch (error) {
      setActionError(errorMessage(error));
      pendingFocus.current = () => alertRef.current?.focus();
    } finally {
      if (mounted.current) {
        setAssigning(false);
        setFocusTick((n) => n + 1);
      }
    }
  }

  function askToRemove(id: string) {
    setActionError(undefined);
    setAnnouncement("");
    setConfirmingId(id);
    pendingFocus.current = () => confirmRef.current?.focus();
  }

  function cancelRemove(id: string) {
    setConfirmingId(null);
    pendingFocus.current = () => removeButtons.current[id]?.focus();
  }

  async function confirmRemove(row: TeamRow) {
    if (removing.current) return;
    removing.current = true;
    try {
      await unassigner(code, row.id);
      setConfirmingId(null);
      await reloadTeam();
      setAnnouncement(`Se quitó la función «${row.roleLabel}» a ${row.email}.`);
      pendingFocus.current = () => statusRef.current?.focus();
    } catch (error) {
      setConfirmingId(null);
      setActionError(errorMessage(error));
      pendingFocus.current = () => alertRef.current?.focus();
    } finally {
      removing.current = false;
      // Re-render so the pending focus move runs even if no state changed.
      if (mounted.current) setFocusTick((n) => n + 1);
    }
  }

  function onConfirmKeyDown(event: KeyboardEvent<HTMLElement>, id: string) {
    if (event.key === "Escape") cancelRemove(id);
  }

  const rows = team === null ? [] : buildTeamRows(team, members);
  const activeMembers = members.filter((m) => m.status === "active");
  const qualification = requiredQualificationLabel(role);

  const columns: TableColumn<TeamRow>[] = [
    { key: "person", header: "Persona", render: (r) => r.email },
    { key: "role", header: "Función", render: (r) => r.roleLabel },
    {
      key: "actions",
      header: "Acciones",
      render: (r) => {
        if (confirmingId === r.id) {
          return (
            <span className="inline-flex gap-2" onKeyDown={(e) => onConfirmKeyDown(e, r.id)}>
              <Button ref={confirmRef} variant="primary" size="sm" aria-label={`Confirmar quitar a ${r.email} como ${r.roleLabel}`} onClick={() => confirmRemove(r)}>
                Confirmar
              </Button>
              <Button size="sm" onClick={() => cancelRemove(r.id)}>
                Cancelar
              </Button>
            </span>
          );
        }
        return (
          <Button
            ref={(el) => {
              removeButtons.current[r.id] = el;
            }}
            size="sm"
            aria-label={`Quitar a ${r.email} como ${r.roleLabel}`}
            onClick={() => askToRemove(r.id)}
          >
            Quitar
          </Button>
        );
      },
    },
  ];

  const personErrorId = `${idPrefix}-person-error`;
  const roleErrorId = `${idPrefix}-role-error`;
  const noteId = `${idPrefix}-qualification-note`;
  const roleDescribedBy = [qualification ? noteId : null, roleError ? roleErrorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <Panel title="Equipo del proyecto">
      {listError ? (
        <div className="flex flex-col items-start gap-3">
          <Notice tone="bad">{listError}</Notice>
          <Button onClick={retry}>Reintentar</Button>
        </div>
      ) : null}
      {team === null && !listError ? <p className="text-s text-muted">Cargando el equipo…</p> : null}

      {team !== null && team.length === 0 ? <p className="text-s text-muted">Todavía no hay equipo asignado</p> : null}
      {team !== null && team.length > 0 ? (
        <div className="overflow-x-auto">
          <Table caption="Equipo del proyecto" columns={columns} rows={rows} getRowKey={(r) => r.id} />
        </div>
      ) : null}

      {team !== null ? (
        <form aria-label="Asignar una función" aria-busy={assigning} noValidate onSubmit={handleAssign} className="flex flex-col gap-4">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-2.5">
            <div className="flex flex-col gap-1">
              <label className="flex flex-col gap-1 text-xs text-muted">
                <span>Persona</span>
                <select
                  ref={personRef}
                  className={`${INPUT_CLASS} ${FOCUS_CLASS} ${personError ? "border-bad" : "border-hair"}`}
                  value={memberId}
                  onChange={(e) => {
                    edited();
                    setPersonError(undefined);
                    setMemberId(e.target.value);
                  }}
                  aria-invalid={personError ? true : undefined}
                  aria-describedby={personError ? personErrorId : undefined}
                >
                  <option value="">Elige una persona</option>
                  {activeMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.email}
                    </option>
                  ))}
                </select>
              </label>
              {personError ? (
                <p id={personErrorId} role="alert" className="text-s text-bad">
                  {personError}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <label className="flex flex-col gap-1 text-xs text-muted">
                <span>Función</span>
                <select
                  ref={roleRef}
                  className={`${INPUT_CLASS} ${FOCUS_CLASS} ${roleError ? "border-bad" : "border-hair"}`}
                  value={role}
                  onChange={(e) => {
                    edited();
                    setRoleError(undefined);
                    setRole(e.target.value);
                  }}
                  aria-invalid={roleError ? true : undefined}
                  aria-describedby={roleDescribedBy}
                >
                  <option value="">Elige una función</option>
                  {PROJECT_ROLES.map((value) => (
                    <option key={value} value={value}>
                      {projectRoleLabel(value)}
                    </option>
                  ))}
                </select>
              </label>
              {qualification ? (
                <p id={noteId} className="text-s text-muted">
                  Esta función exige la cualificación «{qualification}».
                </p>
              ) : null}
              {roleError ? (
                <p id={roleErrorId} role="alert" className="text-s text-bad">
                  {roleError}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" size="sm" disabled={assigning}>
              Asignar
            </Button>
          </div>
        </form>
      ) : null}

      {actionError ? (
        <Notice tone="bad" ref={alertRef} tabIndex={-1}>
          {actionError}
        </Notice>
      ) : null}
      {announcement ? (
        <div ref={statusRef} role="status" tabIndex={-1} className="text-s text-ok">
          {announcement}
        </div>
      ) : null}
    </Panel>
  );
}
