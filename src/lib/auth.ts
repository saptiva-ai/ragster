import {NextAuthOptions} from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import clientPromise from "@/lib/mongodb";
import {compare} from "bcryptjs";

// Declaración de los tipos adicionales para la sesión y el usuario en NextAuth
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role?: string | null;
    };
  }

  interface User {
    id: string;
    name?: string | null;
    email?: string | null;
    role?: string | null;
  }
}

// Configuración de NextAuth
export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credenciales",
      credentials: {
        email: {label: "Correo electrónico", type: "email"},
        password: {label: "Contraseña", type: "password"},
      },
      async authorize(credentials) {
        // Validar que se proporcionen correo y contraseña
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Correo y contraseña requeridos");
        }

        // Conectar a la base de datos
        const client = await clientPromise;
        const db = client.db(process.env.MONGODB_DB); 
        const user = await db
          .collection("users")
          .findOne({email: credentials.email});

        // Verificar si el usuario existe
        if (!user) {
          throw new Error("No se encontró un usuario con este correo");
        }

        // Verificar contraseña
        const isValid = await compare(credentials.password, user.password);

        if (!isValid) {
          throw new Error("Contraseña inválida");
        }

        // Retornar datos del usuario
        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  adapter: MongoDBAdapter(clientPromise),
  pages: {
    signIn: "/auth/signup", // Página personalizada para inicio de sesión
  },
  session: {
    strategy: "jwt", // Se utiliza JWT para manejar sesiones
  },
  callbacks: {
    // Callback para personalizar el token JWT
    async jwt({token, user}) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    // Callback para personalizar la sesión
    async session({session, token}) {
      if (session?.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
};
