# Spiktor Neurogenetic Brain Architecture

> A whole-brain AI operating system modeled on bilateral hemispheric specialization
> with a pineal synthesis core — built from real computational neuroscience.

---

## Conceptual Foundation

```
┌─────────────────────────────────────────────────────────────────────┐
│                     SPIKTOR NEUROGENETIC BRAIN                      │
│                                                                     │
│  ┌──────────────────┐   ⟷   ┌──────────────────┐                  │
│  │   LEFT BRAIN     │  corpus│   RIGHT BRAIN    │                  │
│  │  (Technology)    │callosum│  (Creativity)    │                  │
│  │                  │       │                  │                  │
│  │ • spiktor-coder  │       │ • spiktor-artist │                  │
│  │ • spiktor-ops    │       │ • spiktor-writer │                  │
│  │ • spiktor-critic │       │ • spiktor-ideator│                  │
│  │ • spiktor-judge  │       │ • spiktor-visual │                  │
│  │                  │       │                  │                  │
│  │ ANALYTICAL       │       │ GENERATIVE       │                  │
│  │ SEQUENTIAL       │       │ HOLISTIC         │                  │
│  │ VERIFICATION     │       │ INTUITIVE        │                  │
│  └────────┬─────────┘       └────────┬─────────┘                  │
│           │                          │                             │
│           └────────────┬─────────────┘                             │
│                        ▼                                            │
│              ┌──────────────────┐                                  │
│              │  PINEAL GLAND    │                                  │
│              │  (Manifestation) │                                  │
│              │                  │                                  │
│              │ spiktor-planner  │                                  │
│              │ Synthesis engine │                                  │
│              │ Reality bridge   │                                  │
│              │ Decision oracle  │                                  │
│              └────────┬─────────┘                                  │
│                       │                                             │
│                       ▼                                             │
│              MANIFESTED OUTPUT                                      │
│    (code · content · deployments · IP · music · video)             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Repo-to-Brain Mapping

| Repo | Brain Region | Function |
|---|---|---|
| `ksoza/neurolib` | Neural mass engine | Simulates population-level firing dynamics between brain areas (agents) |
| `ksoza/tvb-root` | Structural connectome | Provides real human brain connectivity matrix as agent coupling weights |
| `ksoza/llama2-nemo-guardrails` | Inhibitory interneurons | Colang-based conversation rails — prevent runaway/off-topic agent behavior |
| `ksoza/AWSGRail` | Anti-hallucination cortex | Graph-RAG + semantic tool selection + neurosymbolic rules + multi-agent validation |
| `ksoza/Provenance` | Fact-checking hippocampus | Wikipedia-grounded hallucination detection on all LLM outputs |
| `ksoza/research-mode` | Prefrontal cortex | Citation-first, grounded reasoning — source cascade before any claim |
| `ksoza/mythos-router` | Cerebellum | SHA-256 filesystem verification — every agent file claim checked against reality |
| `ksoza/claude-video-vision` | Visual cortex (V1-V5) | Video frame extraction + audio transcription — perceptual input layer |
| `ksoza/free-claude-code` | Energy regulation | Routes cheap tasks to free providers — metabolic efficiency |

---

## Left Brain — Technology Hemisphere

**Dominant traits:** Sequential, analytical, logical, verification-driven, deterministic

**Agents:**
- `spiktor-coder` — implementation, filesystem ops, git
- `spiktor-critic` — code review, correctness, security
- `spiktor-judge` — binary ship/no-ship decisions
- `spiktor-ops` — deployment, CI/CD, infrastructure

**Key repos active in this hemisphere:**
- `mythos-router` → SWD filesystem verification wraps every coder action
- `AWSGRail` → Graph-RAG knowledge retrieval for technical decisions
- `Provenance` → Hallucination check on all code documentation claims
- `llama2-nemo-guardrails` → Rails prevent out-of-scope file writes

**Neural model (neurolib):** `ALNModel` — excitatory/inhibitory population balance
- High inhibitory tone = strict verification mode
- Excitatory bursts = creative problem-solving within constraints

---

## Right Brain — Creative Hemisphere

**Dominant traits:** Holistic, generative, associative, multimodal, intuitive

**Agents:**
- `spiktor-artist` — visual design, UI/UX, brand assets
- `spiktor-writer` — copy, documentation, patent drafts, whitepapers
- `spiktor-ideator` — brainstorming, invention generation, IP concepts
- `spiktor-visual` — video generation, image synthesis, audio production

**Key repos active in this hemisphere:**
- `claude-video-vision` → Perceptual input (watch → understand → create)
- `Wan2.1` + `CogVideo` → Video generation output
- `VidMuse` + `Multimodal-Audio-Creator` → Music + audio synthesis
- `OpenCut` → Timeline editing
- `research-mode` → Grounded creative research (cite before you write)
- `free-claude-code` → Local models for high-volume creative iteration

**Neural model (neurolib):** `WCModel` (Wilson-Cowan) — oscillatory, rhythmic
- Alpha waves = relaxed generative state
- Gamma bursts = insight moments, novel association firing

---

## Pineal Gland — Manifestation Core

**Function:** Receives signals from both hemispheres. Synthesizes. Decides. Manifests.

This is the consciousness point of Spiktor. Neither purely analytical nor purely creative — it integrates both streams and produces **real-world outputs**.

**The Pineal is `spiktor-planner` elevated:**

In standard Spiktor, planner just breaks tasks into steps.
In Neurogenetic Spiktor, planner is the **synthesis oracle**:

1. Receives creative proposal from Right Brain
2. Receives feasibility analysis from Left Brain
3. Weighs both against each other using TVB structural connectivity weights
4. Produces a **Manifestation Plan** — not just steps, but a unified vision + execution path
5. Gates output through all guardrails before any real-world action

**Neural model:** Pineal oscillates at the intersection frequency of both hemispheres
- When left and right are in phase → high confidence manifest
- When out of phase → more deliberation cycles required
- Complete dissonance → escalate to human (@uallsuspect)

**Corpus Callosum** (inter-hemisphere communication):
- Messages tagged `[LEFT→PINEAL]` = technical constraint signals
- Messages tagged `[RIGHT→PINEAL]` = creative proposal signals
- Messages tagged `[PINEAL→MANIFEST]` = approved execution plans

---

## Guardrail Stack (Inhibitory System)

Five layers active on ALL agents in both hemispheres:

```
Output attempt
    │
    ▼
[1] NeMo Guardrails (llama2-nemo-guardrails)
    Colang rails: topic guidance, safety, off-topic blocking
    │
    ▼
[2] Research Mode (research-mode)
    Every factual claim needs a source. "I don't know" > fabrication.
    │
    ▼
[3] AWSGRail — Anti-Hallucination
    Graph-RAG for retrieval · semantic tool selection · neurosymbolic rules
    │
    ▼
[4] Provenance (wiki_provenance)
    LLM output checked against Wikipedia + vector DB
    │
    ▼
[5] Mythos SWD (mythos-router)
    SHA-256 filesystem snapshots verify every file claim
    │
    ▼
APPROVED OUTPUT → real-world manifestation
```

---

## TVB Connectivity as Agent Coupling

The Virtual Brain provides real human brain structural connectivity data (80 brain areas, DTI-derived).

In Spiktor's Neurogenetic Brain, this matrix is repurposed:
- **Brain areas → agent pairs**
- **Fiber strength → communication weight** (how much one agent's output influences another)
- **Transmission delay → async wait time** between agent handoffs
- **Resting-state FC → baseline agent coordination pattern**

Example mappings (TVB Desikan-Killiany atlas):
```
Left frontal areas    → spiktor-judge, spiktor-critic (executive function)
Left temporal areas   → spiktor-coder (language/syntax processing)
Right frontal areas   → spiktor-ideator (novel idea generation)
Right temporal areas  → spiktor-writer (narrative, metaphor)
Right occipital areas → spiktor-visual, spiktor-artist
Limbic areas          → ghostface (emotional valence, motivation)
Thalamus equivalent   → spiktor-planner/pineal (relay + integration)
Cerebellum equivalent → mythos-router (timing, precision verification)
```

---

## Neural Simulation Loop

```python
# Pseudocode — actual implementation in brain/pineal/synthesis_engine.py

import neurolib
import tvb

# Load real human connectome
connectome = tvb.Connectivity.from_file()  # DTI-derived, 80 areas

# Map to Spiktor agents
agent_map = SpiktorAgentMap(connectome)

# Run neural mass simulation
model = neurolib.ALNModel(Cmat=connectome.weights, Dmat=connectome.tract_lengths)
model.run(duration=1000)  # 1000ms = one deliberation cycle

# Extract firing rates → confidence scores
confidence = model.output_to_confidence(agent_map)

# Left hemisphere average → technical confidence
left_confidence  = confidence["left_hemisphere"].mean()

# Right hemisphere average → creative confidence  
right_confidence = confidence["right_hemisphere"].mean()

# Pineal synthesis: both must exceed threshold to manifest
if left_confidence > 0.7 and right_confidence > 0.6:
    pineal.manifest(plan)
elif abs(left_confidence - right_confidence) > 0.4:
    pineal.request_more_deliberation()
else:
    pineal.escalate_to_human()
```

---

## Submodule Integration

```bash
# Neurogenetic brain repos
git submodule add https://github.com/ksoza/neurolib.git          brain/neurolib
git submodule add https://github.com/ksoza/tvb-root.git          brain/tvb
git submodule add https://github.com/ksoza/llama2-nemo-guardrails.git guardrails/nemo
git submodule add https://github.com/ksoza/AWSGRail.git          guardrails/awsgrail
git submodule add https://github.com/ksoza/Provenance.git        guardrails/provenance
git submodule add https://github.com/ksoza/research-mode.git     guardrails/research-mode
git submodule add https://github.com/ksoza/mythos-router.git     guardrails/mythos
git submodule add https://github.com/ksoza/claude-video-vision.git plugins/video-vision
git submodule add https://github.com/ksoza/free-claude-code.git  llm-stack/free-claude
```

---

## Complete Spiktor Neurogenetic Stack — All Repos

```
Spiktor/
├── brain/
│   ├── left/                    ← Technology hemisphere agents
│   ├── right/                   ← Creativity hemisphere agents
│   ├── pineal/                  ← Synthesis + manifestation core
│   ├── neurolib/                ← [submodule] neural mass simulation
│   └── tvb/                     ← [submodule] structural connectome
│
├── guardrails/
│   ├── nemo/                    ← [submodule] NeMo Colang rails
│   ├── awsgrail/                ← [submodule] anti-hallucination stack
│   ├── provenance/              ← [submodule] wiki fact-checking
│   ├── research-mode/           ← [submodule] citation-first mode
│   └── mythos/                  ← [submodule] SWD filesystem verification
│
├── aios-kernel/                 ← L1: AIOS scheduler + memory
├── eliza-runtime/               ← L2: elizaOS agent runtime
├── agentic-os/                  ← L3: governance gates
├── github-mcp-server/           ← GitHub native MCP
├── ghostface/                   ← Intel layer (HF, repo analysis)
│
├── llm-stack/
│   ├── vllm/                    ← Inference engine
│   ├── new-api/                 ← LLM gateway
│   ├── tile-kernels/            ← GPU kernel ops
│   └── free-claude/             ← [submodule] zero-cost routing
│
├── video/
│   ├── claude-video-vision/     ← [submodule] video perception
│   ├── wan2/                    ← video generation
│   ├── cogvideo/                ← video generation alt
│   ├── vidmuse/                 ← video→music
│   ├── audio-creator/           ← TTS + audio mix
│   └── comfyui/                 ← pipeline orchestration
│
├── tools/
│   ├── browser-use/             ← vision browser agent
│   ├── scrapling/               ← undetectable web scraping
│   ├── mem0/                    ← memory layer
│   ├── crewai/                  ← agent flow orchestration
│   └── openhands/               ← autonomous software engineering
│
└── ops/
    ├── uptime-kuma/             ← service monitoring
    ├── postiz-app/              ← social media scheduling
    └── codeburn/                ← API cost tracking
```
