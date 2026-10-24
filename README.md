# Ruthless Claude

A Claude Code plugin with two parts.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install ruthless-claude --marketplace mody51510000-code/ruthless-claude
```

Answer `y` to add the marketplace, then pick a scope. Or from a shell:

```
claude plugin install ruthless-claude --marketplace mody51510000-code/ruthless-claude
```

## What it does

**1. The skill — `/ruthless-claude <task>`**
A second, pitch-black Claude with angry white eyes takes your task, lets normal Claude write a first
draft, then has a separate reviewer tear it apart and score it. Claude fixes every point and the loop
repeats until the score reaches 9/10 (max 4 rounds). You get the final result plus a short squeeze log.

Add `--compare` (or "compare" / "show the difference") to see normal Claude's first draft next to the
final one, with each improvement explained. It's off by default because it adds output tokens.

```
/ruthless-claude write a script that renames my photos by date --compare
```

Works best for code, scripts that touch files, and anything where a mistake is costly.
For quick questions, plain Claude is faster and cheaper.

**2. The side pane**
A small pixel-art pane next to the chat:
- idle: Claude and Ruthless Claude standing and breathing
- normal Claude working: Claude typing at a computer
- Ruthless Claude active: Ruthless grabs Claude and squeezes the best result out of him

The pane opens by itself in wide terminals (144+ columns). In narrower ones run `/ruthless-pane`.

## All commands

| Command | What it does |
| --- | --- |
| `/ruthless-claude <task>` | Squeeze the task through review rounds until it scores 9/10 (max 4) |
| `/ruthless-claude <task> --compare` | Same, plus normal Claude's first draft vs the final one |
| `/ruthless-pane` | Open the side pane |
| `/ruthless-help` | Show how to use it and all commands |

You can also just say "Ruthless Claude" or "squeeze it" in a prompt.
The first session after installing prints this guide once in the chat.

Replies follow your language: English, Arabic, or anything else.
