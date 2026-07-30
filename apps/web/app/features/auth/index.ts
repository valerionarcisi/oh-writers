export { LoginForm } from "./components/LoginForm";
export { RegisterForm } from "./components/RegisterForm";
export { PasswordInput } from "./components/PasswordInput";

// Route-loader server functions (login / register / invite). Exported here so
// the route files import from the barrel like every other cross-feature use.
export {
  fetchLoginData,
  fetchIsAuthenticated,
  fetchInviteUser,
} from "./server/auth-routes.server";

// The shell's current-user RPC (distinct from the invite-route loader above).
export { fetchCurrentUser } from "./fetch-current-user.server";
export type { SerializableUser } from "./fetch-current-user.server";
