export async function parseApiResponse<T>(response: Response): Promise<T> {
  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new Error(`Quizbee server returned an unexpected response (HTTP ${response.status}). Check the Vercel logs.`);
  }
  if (!response.ok) {
    const message = data && typeof data === "object" && "error" in data ? data.error : undefined;
    throw new Error(typeof message === "string" && message ? message : `Quizbee server request failed (HTTP ${response.status}).`);
  }
  return data as T;
}
