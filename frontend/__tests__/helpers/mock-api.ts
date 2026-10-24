/**
 * RGB-13: a code that is not a PRY-EJ sample is asked to `GET /api/projects/{code}`. Tests of the project
 * screens that only use samples install this stub so that «a project that does not exist» is a clean 404
 * from the API instead of a network failure.
 */
export function stubProjectNotFound(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const code = decodeURIComponent(String(url).split("/api/projects/")[1] ?? "");
    return {
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ detail: { code: "project_not_found", message: `No existe el proyecto ${code}.` } }),
    };
  }) as unknown as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}
