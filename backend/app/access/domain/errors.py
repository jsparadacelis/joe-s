"""Business rejections of the access context. Messages are user-facing Spanish text."""

from __future__ import annotations


class AccessError(Exception):
    code = "access_error"

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


class AssignmentAlreadyExists(AccessError):
    code = "assignment_already_exists"

    def __init__(self) -> None:
        super().__init__("Esa persona ya tiene esa función en el proyecto.")


class ProjectNotFound(AccessError):
    code = "project_not_found"

    def __init__(self) -> None:
        super().__init__("No existe ese proyecto.")


class MemberNotFound(AccessError):
    code = "member_not_found"

    def __init__(self) -> None:
        super().__init__("No existe esa persona en el estudio.")


class MemberNotActive(AccessError):
    code = "member_not_active"

    def __init__(self) -> None:
        super().__init__("Solo se asigna a personas con acceso activo al estudio.")


class AssignmentNotFound(AccessError):
    code = "assignment_not_found"

    def __init__(self) -> None:
        super().__init__("No existe esa asignación en el proyecto.")


class NoAuthority(AccessError):
    code = "no_authority"

    def __init__(self) -> None:
        super().__init__(
            "No tienes autoridad para gestionar el equipo de este proyecto. "
            "Pueden hacerlo: Socio, Director, Director de proyecto."
        )


class SigningFunctionRestricted(NoAuthority):
    """Signing, site management and sponsor decide who promotes late phases."""

    def __init__(self) -> None:
        AccessError.__init__(
            self,
            "Solo un socio o un director puede dar o quitar las funciones de firmante "
            "habilitado, dirección facultativa y sponsor.",
        )


class MissingQualification(AccessError):
    code = "missing_qualification"

    def __init__(self) -> None:
        super().__init__(
            "Esa persona no tiene la cualificación necesaria para esta función. "
            "Un socio debe concedérsela primero."
        )


_NOT_PERMITTED = {
    "score": "Solo un socio o un director puede puntuar una oportunidad.",
    "edit_settings": "Solo un socio o un director puede cambiar los ajustes.",
    "create_opportunity": (
        "Solo un socio, un director o un director de proyecto puede dar de alta una oportunidad."
    ),
}


class NotPermitted(AccessError):
    """The role may not do this study-wide action (scoring, settings, sign-up)."""

    code = "no_authority"

    def __init__(self, action: str) -> None:
        super().__init__(_NOT_PERMITTED.get(action, "No tienes permiso para hacer esto."))
