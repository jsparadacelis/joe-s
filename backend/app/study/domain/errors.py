"""Rejections of the study context. Messages are user-facing Spanish text."""

from __future__ import annotations


class StudyError(Exception):
    code = "study_error"

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class Unauthenticated(StudyError):
    code = "unauthenticated"

    def __init__(self) -> None:
        super().__init__("Inicia sesión para continuar.")


class NotInvited(StudyError):
    code = "not_invited"

    def __init__(self) -> None:
        super().__init__(
            "Tu cuenta no tiene invitación a ningún estudio. "
            "Pide a un socio o director que te invite."
        )


class MemberRevoked(StudyError):
    code = "member_revoked"

    def __init__(self) -> None:
        super().__init__("Tu acceso al estudio ha sido revocado. Habla con un socio o director.")


class MfaRequired(StudyError):
    code = "mfa_required"

    def __init__(self) -> None:
        super().__init__(
            "Tu rol exige verificación en dos pasos. Actívala e inicia sesión de nuevo."
        )


class EmailNotVerified(StudyError):
    code = "email_not_verified"

    def __init__(self) -> None:
        super().__init__(
            "El correo de tu cuenta no está verificado. "
            "Verifícalo con tu proveedor e inténtalo de nuevo."
        )


class NoAuthority(StudyError):
    code = "no_authority"

    def __init__(self) -> None:
        super().__init__("Solo un socio o un director puede gestionar los miembros del estudio.")


class RoleRestricted(NoAuthority):
    """Only a partner may invite or revoke the management roles (no privilege escalation)."""

    def __init__(self) -> None:
        StudyError.__init__(
            self,
            "Solo un socio puede invitar o revocar a un socio, un director o a administración.",
        )


class QualificationsRestricted(NoAuthority):
    """Qualifications grant authority in advanced phases, so only a partner hands them out."""

    def __init__(self) -> None:
        StudyError.__init__(
            self,
            "Solo un socio puede conceder cualificaciones "
            "(firmante habilitado, dirección facultativa, sponsor).",
        )


class LastPartner(StudyError):
    code = "last_partner"

    def __init__(self) -> None:
        super().__init__(
            "No se puede revocar al último socio activo del estudio. Invita antes a otro socio."
        )


class MemberAlreadyExists(StudyError):
    code = "member_already_exists"

    def __init__(self) -> None:
        super().__init__("Ya existe un miembro con ese correo en el estudio.")


class MemberNotFound(StudyError):
    code = "member_not_found"

    def __init__(self) -> None:
        super().__init__("No existe ese miembro en el estudio.")


class InvalidEmail(StudyError):
    code = "invalid_email"

    def __init__(self) -> None:
        super().__init__("El correo no es válido.")
