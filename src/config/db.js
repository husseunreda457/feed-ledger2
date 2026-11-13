import mongoose from "mongoose";

export async function connectDB() {
  if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
    throw new Error("MONGODB_URI و JWT_SECRET لازم يتحطوا في ملف .env");
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB connected");
}
