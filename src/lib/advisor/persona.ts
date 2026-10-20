/** Identidad del asesor. Se reemplaza por la configuración que define el admin (fase del estudio). */
export type Persona = { name: string };

export async function getPersona(): Promise<Persona> {
  return { name: "tu asesor" };
}
