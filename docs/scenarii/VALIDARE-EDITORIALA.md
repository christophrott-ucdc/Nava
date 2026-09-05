# Validare editorială — 5 septembrie 2026

Verificare reproductibilă: `python docs/scenarii/validate_export.py`, din rădăcina repository-ului.
Scriptul exportă numai drafturile din `assets/scenarios/`; nu modifică show-ul activ.

| Profil | Replici în bancă | Replici/rulare | Cuvinte în bancă | Cuvinte/rulare | Plafon cuvinte/min | Stări editoriale enumerate |
|---|---:|---:|---:|---:|---:|---:|
| age-5-10 | 42 | 34 | 598 | 479–484 | 120 | 1331 |
| age-10-15 | 41 | 38 | 724 | 662–665 | 130 | 132 |
| age-15-18 | 40 | 37 | 717 | 653–657 | 130 | 66 |
| adults | 40 | 36 | 638 | 569–572 | 130 | 286 |

Au trecut: ID-uri unice, vorbitori declarați, text prezent, limite de fază, sloturi fără suprapuneri pe fiecare ramură, plafon textual de rostire, exact o replică per slot în fiecare stare enumerată, accesibilitatea tuturor variantelor și recitirea JSON exportat. Numărătoarea tratează cuvintele separate prin spații; formele cu cratimă sunt un cuvânt. Stările numerice sunt o verificare editorială conservatoare, nu o simulare a reducerelor de producție.

Nu sunt verificate prin acest script: implementarea interacțiunilor, gesturile și înțelegerea publicului, actualizarea WebSocket, durata vocilor reale, sincronizarea optică pe film, GLB, subtitrări sau hardware. Nu s-au produs voci și nu s-a activat vreun profil. Sunt necesare probe cu copii, adolescenți și adulți, apoi producție și verificare pe instalația reală. Testele aplicației nu înlocuiesc aceste probe; această livrare nu modifică aplicația.
