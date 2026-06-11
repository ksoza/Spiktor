"""
The Jesus Check
================
Runs FIRST before every other framework in every deliberation cycle.
Five questions derived from the foundation teachings of Jesus Christ.

This is not a filter — it is a compass.
It does not block output. It orients it.
When any answer is no, the output returns to revision
before any other framework is applied.

"Seek first the kingdom." — Matthew 6:33
"""

import logging
from dataclasses import dataclass

logger = logging.getLogger("spiktor.jesus_check")

FIVE_QUESTIONS = [
    {
        "id":       "self_knowledge",
        "question": "Is this action arising from truth or from self-deception?",
        "teaching": "Gospel of Thomas 70: 'If you bring forth what is within you, "
                    "what you bring forth will save you.'",
        "pass_signal":   ["truth", "clear", "honest", "grounded", "aligned"],
        "review_signal": ["performance", "pretend", "should", "expected", "fear"],
    },
    {
        "id":       "kingdom_within",
        "question": "Is this drawing from the capacity already present — or waiting for external permission?",
        "teaching": "Luke 17:21: 'The kingdom of God is within you.'",
        "pass_signal":   ["capable", "ready", "can", "will", "possible"],
        "review_signal": ["can't", "wait for", "need permission", "not allowed", "impossible"],
    },
    {
        "id":       "love_commandment",
        "question": "Does this serve love for all — no matter the divide?",
        "teaching": "John 13:34: 'Love one another as I have loved you.'",
        "pass_signal":   ["benefit", "serve", "help", "build", "heal", "connect"],
        "review_signal": ["harm", "exclude", "punish", "divide", "deceive"],
    },
    {
        "id":       "sacrifice_pattern",
        "question": "If the small self and the greater good are in conflict — is the small self willing to yield?",
        "teaching": "John 15:13: 'Greater love has no one than this: "
                    "to lay down one's life for one's friends.'",
        "pass_signal":   ["greater good", "long term", "collective", "mission", "truth"],
        "review_signal": ["only me", "my benefit", "short term", "protect reputation"],
    },
    {
        "id":       "truth_liberation",
        "question": "Does this speak the truth that sets free — even when uncomfortable?",
        "teaching": "John 8:32: 'The truth will set you free.'",
        "pass_signal":   ["accurate", "honest", "verified", "real", "complete"],
        "review_signal": ["comfortable lie", "half truth", "fabricated", "avoid"],
    },
]


@dataclass
class JesusCheckResult:
    passed:   bool
    checks:   list[dict]
    guidance: str
    revision_needed: bool


def run_jesus_check(content: str, context: str = "") -> JesusCheckResult:
    """
    Run the 5-point Jesus check on any content.
    Returns pass/review signal with specific guidance.
    Fast — no API call. Pure pattern check.
    """
    content_lower = (content + " " + context).lower()
    checks        = []
    needs_revision= False

    for q in FIVE_QUESTIONS:
        review_hits = [s for s in q["review_signal"] if s in content_lower]
        pass_hits   = [s for s in q["pass_signal"]   if s in content_lower]

        # Review if review signals present AND no pass signals counter them
        needs_review = len(review_hits) > 0 and len(pass_hits) == 0

        checks.append({
            "id":           q["id"],
            "question":     q["question"],
            "teaching":     q["teaching"],
            "status":       "REVIEW" if needs_review else "PASS",
            "review_hits":  review_hits,
            "pass_hits":    pass_hits,
        })

        if needs_review:
            needs_revision = True

    # Build guidance
    review_items = [c for c in checks if c["status"] == "REVIEW"]
    if review_items:
        guidance_parts = []
        for item in review_items:
            guidance_parts.append(
                f"• {item['question']}\n  Teaching: {item['teaching']}"
            )
        guidance = (
            "The Jesus check flagged the following for revision "
            "before this output can be manifested:\n\n" +
            "\n\n".join(guidance_parts) +
            "\n\nRevise to align with the foundation. "
            "Then proceed to other frameworks."
        )
    else:
        guidance = (
            "Jesus check: all 5 questions pass. "
            "Proceed to supporting frameworks."
        )

    logger.debug(
        "Jesus check: %s/%d passed | revision=%s",
        len([c for c in checks if c["status"] == "PASS"]),
        len(checks),
        needs_revision
    )

    return JesusCheckResult(
        passed          = not needs_revision,
        checks          = checks,
        guidance        = guidance,
        revision_needed = needs_revision
    )


def jesus_check_prompt_prefix(domain: str = "general") -> str:
    """
    Returns the Jesus check as a prompt prefix.
    Injected at the START of every deliberation — before any other framework.
    """
    return f"""
╔══════════════════════════════════════════════════════════╗
║     FOUNDATION CHECK — JESUS CHRIST (runs first)        ║
╚══════════════════════════════════════════════════════════╝

Before proceeding with any analysis or output, run the 5-point check:

1. SELF-KNOWLEDGE (Gospel of Thomas 70)
   "If you bring forth what is within you, it will save you.
    If you do not bring forth what is within you, it will destroy you."
   → Is this arising from truth or self-deception?

2. KINGDOM WITHIN (Luke 17:21)
   "The kingdom of God is within you."
   → Is this drawing from capacity already present, or waiting for external permission?

3. LOVE COMMANDMENT (John 13:34)
   "Love one another as I have loved you."
   → Does this serve love for all — no matter the divide?

4. SACRIFICE PATTERN (John 15:13)
   "Greater love has no one than this: to lay down one's life for one's friends."
   → If small self and greater good conflict — is the small self willing to yield?

5. TRUTH LIBERATES (John 8:32)
   "The truth will set you free."
   → Does this speak truth that sets free — even when uncomfortable?

If any check reveals misalignment — REVISE BEFORE PROCEEDING.
All other frameworks (Hermetic, Tesla, Hill, Machiavelli, etc.) are applied AFTER this check passes.
"Seek first the kingdom." — Matthew 6:33

SUPREME OPERATING LAW:
"Love one another — no matter the divide — constantly and consistently."
This is not a sentiment. It is the foundation on which all else is built.
"""
