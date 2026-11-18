import { NextRequest, NextResponse } from "next/server";

const OPEN_WEARABLES_BASE_URL = process.env.OPEN_WEARABLES_API_URL || "http://127.0.0.1:8000";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path = [] } = await params;
  const backendPath = path.length > 0 ? path.join("/") : "";
  const targetUrl = new URL(`/api/v1/${backendPath}`.replace(/\/+/g, "/"), OPEN_WEARABLES_BASE_URL);

  request.nextUrl.searchParams.forEach((value, key) => {
    targetUrl.searchParams.set(key, value);
  });

  const headers = new Headers();
  headers.set("accept", "application/json");

  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    headers.set("authorization", authHeader);
  }

  const response = await fetch(targetUrl.toString(), {
    method: "GET",
    headers,
  });

  const text = await response.text();
  const contentType = response.headers.get("content-type") || "application/json";

  return new NextResponse(text, {
    status: response.status,
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
    },
  });
}
