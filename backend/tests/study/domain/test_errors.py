import pytest

from backend.app.study.domain import errors


def test_every_error_carries_a_code_and_a_spanish_message():
    cases = [
        (errors.Unauthenticated(), "unauthenticated", "Inicia sesión para continuar."),
        (
            errors.NotInvited(),
            "not_invited",
            "Tu cuenta no tiene invitación a ningún estudio. Pide a un socio o director que te invite.",
        ),
        (
            errors.MemberRevoked(),
            "member_revoked",
            "Tu acceso al estudio ha sido revocado. Habla con un socio o director.",
        ),
        (
            errors.MfaRequired(),
            "mfa_required",
            "Tu rol exige verificación en dos pasos. Actívala e inicia sesión de nuevo.",
        ),
        (
            errors.EmailNotVerified(),
            "email_not_verified",
            "El correo de tu cuenta no está verificado. Verifícalo con tu proveedor e inténtalo de nuevo.",
        ),
        (
            errors.NoAuthority(),
            "no_authority",
            "Solo un socio o un director puede gestionar los miembros del estudio.",
        ),
        (
            errors.MemberAlreadyExists(),
            "member_already_exists",
            "Ya existe un miembro con ese correo en el estudio.",
        ),
        (
            errors.RoleRestricted(),
            "no_authority",
            "Solo un socio puede invitar o revocar a un socio, un director o a administración.",
        ),
        (
            errors.QualificationsRestricted(),
            "no_authority",
            "Solo un socio puede conceder cualificaciones (firmante habilitado, dirección facultativa, sponsor).",
        ),
        (
            errors.LastPartner(),
            "last_partner",
            "No se puede revocar al último socio activo del estudio. Invita antes a otro socio.",
        ),
        (errors.MemberNotFound(), "member_not_found", "No existe ese miembro en el estudio."),
        (errors.InvalidEmail(), "invalid_email", "El correo no es válido."),
    ]

    for error, code, message in cases:
        assert (error.code, error.message, str(error)) == (code, message, message)


@pytest.mark.parametrize(
    "error_class",
    [
        errors.Unauthenticated,
        errors.NotInvited,
        errors.MemberRevoked,
        errors.MfaRequired,
        errors.EmailNotVerified,
        errors.NoAuthority,
        errors.RoleRestricted,
        errors.QualificationsRestricted,
        errors.LastPartner,
        errors.MemberAlreadyExists,
        errors.MemberNotFound,
        errors.InvalidEmail,
    ],
)
def test_all_errors_share_one_base_class(error_class):
    assert issubclass(error_class, errors.StudyError)
    assert issubclass(errors.StudyError, Exception)


def test_the_restricted_variants_are_no_authority():
    assert issubclass(errors.RoleRestricted, errors.NoAuthority)
    assert issubclass(errors.QualificationsRestricted, errors.NoAuthority)
