import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware() {
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ req, token }) => {
        // Permitir acceso a las rutas /api/wab sin autenticación
        if (req.nextUrl.pathname.startsWith("/api/wab")) {
          return true;
        }
        // Requerir autenticación para todas las demás rutas
        return !!token;
      },
    },
  },
);

export const config = {
  matcher: [
    // Rutas protegidas
    "/weaviate/:path*",
    "/dashboard/:path*",
    //"/api/:path*",
    // Excluir rutas de autenticación y rutas públicas
    "/((?!api/wab|api/query-weaviate|auth|_next/static|_next/image|favicon.ico|public).*)",
  ],
};
