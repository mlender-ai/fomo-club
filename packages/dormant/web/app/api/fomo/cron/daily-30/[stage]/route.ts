import { GET as runDaily30Stage } from "../route";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ stage: string }> }
) {
  const { stage } = await params;
  const url = new URL(request.url);
  url.searchParams.set("stage", stage);
  return runDaily30Stage(new Request(url, request));
}
