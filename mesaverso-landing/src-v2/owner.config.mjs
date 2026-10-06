// Datos del titular que el pie de página y el aviso de privacidad tienen que mostrar (Ley 4868, art. 7).
// Los completa el dueño. Para no dejarlos en el repositorio público se pueden pasar por variables de entorno:
//   OWNER_TITULAR="Nombre Apellido" OWNER_RUC="1234567-8" OWNER_DOMICILIO="..." OWNER_CORREO="..." \
//   OWNER_CORREO_DATOS="..." OWNER_VIGENCIA="dd/mm/aaaa" PUBLISH=1 node build-v2.mjs
// Mientras algún valor siga con «[completar …]», la vista previa lo muestra tal cual y PUBLISH=1 se niega a construir.
const e = (k, fallback) => (process.env["OWNER_" + k] || "").trim() || fallback;

export const OWNER = {
  TITULAR: e("TITULAR", "[completar: nombre y apellido]"),
  RUC: e("RUC", "[completar: RUC]"),
  DOMICILIO: e("DOMICILIO", "[completar: domicilio]"),
  CORREO: e("CORREO", "[completar: correo de contacto]"),
  CORREO_DATOS: e("CORREO_DATOS", "[completar: correo para datos personales]"),
  VIGENCIA: e("VIGENCIA", "[completar: fecha de vigencia]"),
};

export const ownerPending = () => Object.entries(OWNER).filter(([, v]) => /\[completar/.test(v)).map(([k]) => k);
