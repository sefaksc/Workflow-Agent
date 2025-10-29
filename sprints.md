## Sprint 1 — Proje İskeleti & Geliştirme Altyapısı

🎯 Hedef

Monorepo/çoklu paket iskeleti, eklenti “Hello World”, webview kabuğu, Python interpreter kontrolü.

Görevler

packages/extension: komutlar (Open Workflow Canvas, Run Workflow)

packages/webview: React bootstrap (Vite), VSCode webview bridge

engine: main.py dummy, env check (LlamaIndex var mı?)

CI: build + lint (TS/ESLint, Py/ruff)

📦 Artefakt

Çalışan eklenti ve webview paneli

README.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md

✅ Kabul

Komut paletinden panel açılır; Python interpreter uyarısı çalışır; CI yeşil

🔗 Bağımlılık

Yok

## Sprint 2 — Görsel Workflow Canvas (Temel) & YAML Senkron

🎯 Hedef

React Flow ile node/edge ekleme-silme, properties panel, Canvas ↔ YAML iki yönlü senk

Görevler

Custom node bileşenleri (LoginForm, LoginAPI)

Properties drawer (id/type/props), validation hataları

YAML view: read-only toggle; parse→Canvas güncelle

📦 Artefakt

İlk YAML üretimi; 2 node + 1 edge demo

✅ Kabul

Kullanıcı 2 node & 1 edge oluşturur, YAML eşleşir; geçersiz YAML uyarıları

🔗 Bağımlılık

Sprint 1

## Sprint 3 — Modern Canvas Görünümü & Auto-Layout

🎯 Hedef

Modern UI: Tailwind, dark/light, minimap, kısayollar; elkjs ile auto-layout

Görevler

Tema sistemi, koyu/açık geçiş; pan/zoom ayarları

Auto-layout: Canvas→ELK graph map, düğüm/port koordinatları → React Flow

100+ node performans & stress test

📦 Artefakt

“Auto-Layout” butonu, modern görünüm

✅ Kabul

50–100 node senaryosunda akıcı zoom/pan; auto-layout temiz oklarla dizilir

🔗 Bağımlılık

Sprint 2

## Sprint 4 — Extension ↔ Python Köprüsü (Protokol v1)

🎯 Hedef

JSON Lines mesajlaşma, process lifecycle, PING/PONG, CANCEL; echo üretim

Görevler

docs/protocol.md

TS bridge + Py stdio handler

RUN_WORKFLOW → sahte files[] döndür (LLM yok)

📦 Artefakt

Çalışan köprü; log/progress/complete akışı

✅ Kabul

Run → 1–2 demo dosya yazılır, diff/preview kabuğu

🔗 Bağımlılık

Sprint 1–3

## Sprint 5 — Chat Agent (VS Code Chat API)

🎯 Hedef

VS Code Chat “participant”: @asistan ile doğal dilden node ekle/bağla/rules/run

Görevler

Chat participant kaydı; streaming cevaplar

NL→Intent→Tools (TS → Py Agent): create_node, connect, set_rule, run_workflow

Chat komutları: /new, /add node, /connect, /rules, /run

📦 Artefakt

Chat ile “login form ve api ekle/bağla” → Canvas & YAML güncellenir → /run ile üretim

✅ Kabul

Chat akışında eksik bilgi sorulur; yanıtla YAML mutasyonu; diff öncesi onay

🔗 Bağımlılık

Sprint 4 (bridge)

Sprint 2–3 (Canvas/YAML)

## Sprint 6 — LlamaIndex Workflow Entegrasyonu (Template-First)

🎯 Hedef

LlamaIndex Workflows ile deterministik şablon üretimi (LLM kapalı, MVP güvenilir)

Görevler

engine/workflow.py: Start → GenerateUI → GenerateAPI → Synthesize → Stop

nodes/login_form.py, nodes/login_api.py (şablon bazlı)

Rules → şablona enjekte (TS/JS, MUI, dosya yolları)

📦 Artefakt

E2E MVP: Canvas→YAML→Run→dosyalar (React/Express iskelet)

✅ Kabul

LoginForm + LoginAPI akışı full üretim; proje çalışır iskelet

🔗 Bağımlılık

Sprint 4

## Sprint 7 — LLM ile Kod Üretimi (Prompting) + Rules

🎯 Hedef

LLM tabanlı kod üretimi (OpenAI vb.), prompt şablonları, parçalı üretim & merge

Görevler

Settings: model, max tokens, API key (SecretStorage)

prompts/: UI/API için sistem/rol/format şablonları; rules+props enjeksiyonu

Parçalı üretim (component/styles/hook) → merge.py

Lint/compile check pipeline

📦 Artefakt

LLM modu (template-first alternatifi); rules etkisi görülebilir

✅ Kabul

Aynı YAML, LLM ile üretildiğinde derlenebilir, lint hatasız (veya otomatik fix)

🔗 Bağımlılık

Sprint 6

## Sprint 8 — Ask-User Döngüsü, Diff/Önizleme, Formatter

🎯 Hedef

Eksik parametrelerde ASK_USER; diff/preview; Prettier/ESLint auto-fix; çakışma politikası

Görevler

Python: eksik tespiti → ASK_USER{question,fields}

Extension: modal/quickpick; yanıt → USER_REPLY

FileWriter: overwrite/rename/skip; diff panel entegrasyonu

Formatter hook (pre/post write)

📦 Artefakt

Interaktif akış; güvenli ve temiz yazım

✅ Kabul

Form alanları eksikse soru sor; cevapla üretim; diff onayı sonrası yazım; formatlı

🔗 Bağımlılık

Sprint 7

## Sprint 9 — Hata Yönetimi, Telemetri, Dayanıklılık

🎯 Hedef

Hata sınıfları, dostça mesajlar, retry/backoff, env diagnostics, opsiyonel telemetri

Görevler

Parse/LLM/IO/Cancel hataları için kodlar ve öneriler

Retry politikaları; timeout’lar

engine/diagnostics.py (version check, import test)

Telemetri (opt-in): süreler, hatalar, token istatistiği

📦 Artefakt

Troubleshooting view; self-check komutu

✅ Kabul

Bozuk YAML, LLM hata, IO hatalarında net mesaj ve çözüm adımı; self-check geçer

🔗 Bağımlılık

Sprint 8

## Sprint 10 — Node Tipi Eklenti Sistemi, Dokümantasyon, Paketleme

🎯 Hedef

Node Registry: yeni node tipi authoring; örnek ProtectedRoute, RegisterForm, DBModel

Dokümantasyon, örnekler, Marketplace paketleme

Görevler

Node sözleşmesi: schema + prompt + generator + test

docs/nodes/authoring.md, examples/

vsce package; ikonlar, animasyon GIF’ler

📦 Artefakt

Dış katkı ile yeni node yazılabilir; paketlenmiş eklenti

✅ Kabul

Harici bir node tipi ekle-dene akışı yalnız dokümanla yapılabilir; eklenti lokal yüklenir

🔗 Bağımlılık

Sprint 9

## 9) Test Stratejisi

Unit

TS: protokol serializer/validator; file writer; settings

Py: YAML parser; node processors; prompt builder; merge utils

Integration

Ext⇄Py “echo” → sahte üretim → dosya yazımı → diff/format

E2E (Playwright)

Canvas’ta 2 node + edge → Run → dosyalar açıldı mı?

Chat: “login form + api” → YAML/Canvas güncellendi mi → Run → dosyalar?

Ask-User akışı → yanıt + tekrar çalıştırma

Static/Lint

TS/ESLint, Py/ruff + mypy (opsiyonel)

Deterministik Mod

Template-first üretim → snapshot (golden files)

Chaos/Cancel

CANCEL düzgün durdurur; temp/artık yok

## 10) Güvenlik / Gizlilik / UX

Dosya Yazım Güvenliği: Sadece workspace içinde; dış path reddedilir

Çakışma: Diff + kullanıcı kararı (overwrite/rename/skip)

Secret’lar: LLM API key VS Code SecretStorage; Python’a env ile

Prompt Hijacking Önlemleri: Sistem prompt sabit; YAML girdileri sanitize/escape

UX: Her kritik adımda görünür bildirim; progress bar; hatada çözüme yönlendirme