import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import type { DB } from "../models/db.js";
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        name: string;
        role: string;
        token_version: number;
      };
    }
  }
}
export function auth(db: DB, secret: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.headers.authorization?.replace(/^Bearer /, "");
      if (!token) return res.status(401).json({ error: "Войдите в аккаунт" });
      const p = jwt.verify(token, secret, {
        algorithms: ["HS256"],
        issuer: "tax-assistant",
        audience: "tax-web",
      }) as jwt.JwtPayload;
      const { rows } = await db.query(
        "SELECT id,email,name,role,token_version FROM users WHERE id=$1 AND active=true",
        [p.sub],
      );
      if (!rows[0] || rows[0].token_version !== p.ver)
        return res.status(401).json({ error: "Сессия завершена" });
      req.user = rows[0];
      next();
    } catch {
      return res.status(401).json({ error: "Недействительная сессия" });
    }
  };
}
export function admin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin")
    return res.status(403).json({ error: "Требуются права администратора" });
  next();
}
export function sign(user: any, secret: string) {
  return jwt.sign({ ver: user.token_version }, secret, {
    subject: String(user.id),
    expiresIn: "8h",
    algorithm: "HS256",
    issuer: "tax-assistant",
    audience: "tax-web",
  });
}
