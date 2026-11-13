import { ZodError } from "zod";

export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ message: "راجع البيانات المدخلة", details: err.issues });
  }
  if (err.status) {
    return res.status(err.status).json({ message: err.message, code: err.code });
  }
  if (err.name === "CastError") return res.status(400).json({ message: "معرّف غير صحيح" });
  console.error(err);
  res.status(500).json({ message: "حصل خطأ في السيرفر" });
}
