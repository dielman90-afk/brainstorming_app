# Bildstände

Hier liegt **je Umgebung genau ein Bildstand**: die Grundlage, gegen die der
nächste Regressionsdiff läuft.

    zen-64         Zengarten      (6 Kameras + 4 Regressionsbilder)
    dojo-48        Dojo
    insel-43       Himmelsinsel
    konstrukt-36   Konstrukt
    planet-21      Nachthimmel / Planet

## Warum nur einer je Umgebung

Bis September 2026 lagen hier 255 Verzeichnisse mit rund 2 500 Bildern, und
jedes davon steckte zusätzlich in der Git-Historie. Der Arbeitsbaum war
1,4 GB gross, `.git` 1,3 GB — bei einem Quelltext von wenigen Megabyte.

Auf Weisung des Nutzers sind die alten Bildstände **aus der Historie dieses
Branches entfernt** worden (`git filter-repo --path tools/shots
--invert-paths --refs HEAD`). Die Logs in `prompts/` nennen bei jedem Paket
einen Bildstand wie `tools/shots/zen-52`; **diese Verzeichnisse gibt es nicht
mehr.** Die Messwerte in den Logs bleiben gültig — sie stehen dort als Zahlen,
nicht als Bilder.

## Regel für neue Läufe

Ein neuer Bildstand **ersetzt** den alten seiner Umgebung, er tritt nicht
daneben. Zwischenstände für eine Abtastung gehören ins Kratzverzeichnis
(`$TMPDIR`), nicht hierher — sie werden in derselben Sitzung gebraucht und
danach nie wieder.
