import { Suspense } from "react";
import { LoginScreen } from "../../components/screens/LoginScreen";

// `useSearchParams()` inside LoginScreen (used to surface ?error=oauth
// from a failed OAuth callback) requires a Suspense boundary above it
// per Next 16's pre-render rules.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}
