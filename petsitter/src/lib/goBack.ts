import type { NavigationProp } from '@react-navigation/native';

/**
 * Go back, or go somewhere, but never do nothing.
 *
 * `navigation.goBack()` is a no-op when there is nothing to go back TO, and it
 * logs "The action 'GO_BACK' was not handled by any navigator" and stops. That
 * is exactly the state every screen is in after a page reload or when a URL is
 * opened directly, because the stack is rebuilt with one entry.
 *
 * QA hit it on Daily Routine, Visit History, My Clients and Sitter Today. The
 * first two at least sit under a guide with a Home button; the sitter screens
 * have none, so a sitter who reloads on My Clients — the screen they will live
 * on — had no route anywhere in the app. In an installed PWA there is no
 * browser back button either, so "just press back" is not an answer: the app is
 * simply over until they force-quit it.
 *
 * Deliberately a plain function taking `navigation` rather than a hook. It has
 * to be applied at forty call sites, and a codemod that inserts a hook into
 * forty components is a far riskier edit than one that swaps an expression.
 *
 * Home rather than a per-screen guess: it exists for every signed-in user, and
 * HomeScreen's own routing sends a sitter on to their client list. One
 * predictable destination beats forty individually plausible ones.
 */
export function safeGoBack(
  navigation: Pick<NavigationProp<any>, 'canGoBack' | 'goBack' | 'navigate'>,
  fallback = 'Home'
): void {
  if (navigation.canGoBack()) {
    navigation.goBack();
    return;
  }
  (navigation.navigate as (screen: string) => void)(fallback);
}
