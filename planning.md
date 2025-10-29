# VSCode Eklentisi — LlamaIndex Tabanlı Workflow’tan Kod Üreten Sistem
**Durum:** Plan  
**Kapsam:** VSCode Extension (TS) + Webview UI (React/React Flow) + Python Engine (LlamaIndex) + YAML Workflow + Chat Agent  
**Hedef MVP:** React (FE) + Node.js/Express (BE) için Login Form + Login API akışını uçtan uca üretmek

---

## 1) Ürün Özeti

**Amaç:** Kullanıcıların görsel bir **workflow** üzerinde node’lar ekleyip bağlayarak, YAML tanımına dönüştürülen bu akıştan **yapay zekâ destekli kod** üretmelerini sağlamak.  
**Ekstra:**  
- VS Code içinde **Chat Agent** ile doğal dilden akış kurma/çalıştırma.  
- **Modern** ve **şık** bir diyagram (React Flow) + **oto-yerleşim** (elkjs).  
- Kullanıcı tanımlı **rules** (YAML) ile framework/dil/stil tercihlerinin uygulanması.  
- Gerektiği yerlerde **soru sorma** (human-in-the-loop).

---

## 2) Kapsam / Kapsam Dışı

**Kapsam**
- VSCode eklentisi (TypeScript)
- Webview UI: React + React Flow + Tailwind temalı modern görünüm, elkjs ile auto-layout
- Python Engine: LlamaIndex Workflows ile node işleme ve kod üretimi
- YAML v1 şeması + iki yönlü senkron (Canvas ↔ YAML)
- Node’lar arası veri akışını modelleyerek ilgili API node'una form alanlarını taşıma (Sprint 4+ için planlanmış advanced workflow katmanı)
- Chat Agent (VS Code Chat API) → doğal dilden akış kurma/çalıştırma
- Dosya yazma, diff/önizleme, formatter (Prettier/ESLint)
- Hata yönetimi, iptal, retry, telemetri (opsiyonel), dokümantasyon, örnekler
- Node eklenti sistemi (yeni node tipleri yazılabilir)

**Kapsam Dışı (ilk faz)**
- Çoklu repo dil desteği (örn. Go, Rust) — **post-MVP**
- Dağıtık kod çalıştırma/CI entegrasyonu — **post-MVP**
- Tam otomatik veri tabanı şeması/migrasyon üretimi — **post-MVP**

---

## 3) Metrikler / Başarı Kriterleri

- **MVP E2E:** LoginForm + LoginAPI akışında 1 dk içinde çalışır iskelet üretebilme
- **Kullanıcı Etkileşimi:** Chat ile “auth akışı kur ve çalıştır” → Canvas + YAML güncellensin
- **DX:** 0 hatayla diff/formatter ile sorunsuz dosya yazımı
- **Performans:** 100 node’lu grafikte akıcı pan/zoom; auto-layout < 2 sn (ortalama)

---

## 4) Mimari Genel Bakış

- **Extension (TS)**
  - Webview (React) — Canvas, properties panel, YAML panel
  - Bridge — Python süreci (child_process) + JSON Lines protokol
  - File Writer — workspace içinde güvenli yazım + diff/preview
  - Settings — LLM key, model, TS/JS, stil kütüphanesi, telemetri

- **Webview (React)**
  - **React Flow** ile modern diyagram
  - **elkjs** ile auto-layout
  - Tailwind temalı light/dark; minimap, zoom/pan, kısayollar

- **Python Engine**
  - YAML parser → WorkflowModel
  - **LlamaIndex Workflows**: `Start → NodeProcessors → Synthesize → Stop`
  - Node Processors: `LoginFormComponent`, `LoginAPIEndpoint` (MVP)
  - Prompt Builder: rules + props → LLM istemleri
  - Ask-User döngüsü: eksik parametreler için soru üretimi
  - Result: `files[]`, `warnings[]`, `logs[]`

- **Chat Agent**
  - VS Code Chat API “participant”
  - LlamaIndex Agent + Tools: `create_node`, `connect`, `set_rule`, `run_workflow`, `open_canvas`
  - NL → YAML mutasyonları → Canvas/YAML senkron

---

## 5) Repo Yapısı

root/
├─ packages/
│ ├─ extension/ # VSCode eklentisi (TS)
│ └─ webview/ # React + React Flow UI
├─ engine/ # Python + LlamaIndex
│ ├─ nodes/ # Node işlemcileri
│ ├─ prompts/ # Prompt şablonları
│ ├─ workflow.py # Orkestrasyon (LlamaIndex Workflow)
│ └─ main.py # stdio bridge (protokol v1)
├─ examples/ # Örnek YAML'lar
├─ docs/ # Protokol, node authoring, troubleshooting
└─ .github/workflows/ # CI


---

## 6) Protokol v1 (Özet)

**Extension → Python**
- `RUN_WORKFLOW`: `{ type, correlationId, yaml, settings }`
- `USER_REPLY`: `{ type, correlationId, reply }`
- `CANCEL`: `{ type, correlationId }`
- `PING`

**Python → Extension**
- `LOG`: `{ level, message }`
- `PROGRESS`: `{ step, pct }`
- `ASK_USER`: `{ question, fields[], context }`
- `ERROR`: `{ code, message, details? }`
- `COMPLETE`: `{ files:[{path, content}], warnings? }`
- `PONG`

> Taşıma: **newline-delimited JSON** (stdout/stdin). Büyük içerikler gerekirse dosya yolu ile.

---

## 7) YAML Şeması v1

```yaml
version: 1
nodes:
  - id: LoginForm1
    type: LoginFormComponent
    props:
      fields:
        - { name: username, type: string, required: true }
        - { name: password, type: password, required: true }
      ui:
        styleLibrary: MaterialUI
        validation: basic
  - id: LoginAPI1
    type: LoginAPIEndpoint
    props:
      method: POST
      path: /login
      auth: none
connections:
  - from: LoginForm1
    to: LoginAPI1
rules:
  frontend:
    framework: React
    language: TS   # TS|JS
  backend:
    framework: NodeExpress
    language: TS   # TS|JS
  coding:
    formatter: prettier
    style: airbnb
