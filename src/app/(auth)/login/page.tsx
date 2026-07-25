import { redirect } from "next/navigation";
import { getAuthenticatedStaffId } from "@/lib/auth-session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  // Đã đăng nhập mà vào /login thì đưa thẳng vào app.
  if (await getAuthenticatedStaffId()) redirect("/");
  return <LoginForm />;
}
