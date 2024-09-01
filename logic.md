1. Restart game

-   The restart logic is that a switchmap is used to manage the game source$ main loop,
-   when the restart$ emits, the source$ is replaced with a new identical stream,
-   where the subscription handles (renders) any stream that is passed into it.
-   RestartGame() action to be called on every restart$.next(), where a new gameStreamObservable() is called and subscribed to, all in a pure way
-   Current issue:
    gameStreamObservable() is not called after the game ends, so a new stream is not created to be subsribed to.
    restarting game doesnt pass high score to new initial state

2. Handling tail notes

-   filter by duration
-   new list for tail notes in state
-   render by tail notes list
-   handlTailNote in Tap, logic for hold
-   Freeze the note if it is active tail note (note that has been verified and tapped by the user in Tap)
-   How to deal with audio.

Current issue

-   Tailnote length (done!!)
-   Playing tailnote
-   Tailnote disappear after duration end (done!!)
    -   Determine tailnote duration formula (done!!)
-   tailnote tail decrease when held down (solution: do it for all tailnotequeue tailnotes) (done!!)
-   Determine tailnote scoring system (done!!)
-   Notes sound note fixed yet, probably overlap
-   Reset tap lineincy to 5%
-   Tailnote expired a few Tick after held down, weird
