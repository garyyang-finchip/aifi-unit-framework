# The financial-circuit analysis profile

`auf:model:financial-circuit@1` is the analysis profile through which the circuit view of token economics is used inside the AIFi Unit Framework. This note explains where it comes from, what it claims and, more importantly, what it does not claim.

## Origin

The profile descends from Gary Yang's 2022 article "Financial Circuit and Web3 Tokenomics Theory" (Foresight News, October 2022; a Chinese-language version appeared on PANews under the title "Financial Circuit and Web3 Economic Model Principles"). The article models token economies with the variables of a circuit: cash quantity `q` as charge, cash flow `i = dq/dt` as current, a value potential difference `v` as voltage, and it names the elements that compose such a circuit: a source of real yield, a resistance of burning, a capacitance (containers such as wallets and aggregators), a staking element with an inductance-like relation `v = s * di/dt`, their combined impedance, and non-linear elements (random prize pools, blind boxes, and, in the outlook, "financial chips"). It states a financial Ohm's law, financial Kirchhoff laws, a financial Thevenin theorem for linear networks, and warns that economic systems are discrete, random and individual, so that scale and stochastic methods matter.

The role vocabulary of the ERC (source, sink, conductor, damping, container, pledge, valve, control) is the economic-function reading of those elements, extended by the valve and control roles that gate flows without holding them.

## What the profile is

A model statement under the profile says: for this Unit, under these premises, these variables stand for these economic quantities, these parts behave like these element types, and this is the window, range and error within which the model is claimed to hold. Element types are `source`, `resistive` (relation between `v` and `i`), `capacitive` (between `q` and `v`), `inductive` (between `phi` and `i`, where `phi` is the time integral of `v`), `memristive` (between `phi` and `q`), `higher-order` (between a derivative or integral of `v` of order `alpha` and one of `i` of order `beta`), `controlled`, `switch` and `stochastic`. Equivalents (for example a Thevenin source and impedance at the ports of a linear model) and a Tellegen consistency check can be attached.

This is a description of the Unit, not a property of it. The same Unit may carry several model statements by different analysts with different premises.

## What the profile is not

- It is not a universal law. The ERC's normative core (boundary, assertions, observations, receipts) does not depend on the circuit view, and a Unit does not have to admit any circuit model.
- The (`alpha`, `beta`) element table is a labeling scheme, not a completeness proof. A series RC is a deterministic, linear one-port that involves both the current and its integral; it is composed of basic elements without being one.
- Thevenin equivalence is an interface abstraction of a linear network over a stated operating range. It does not turn the network into a single first-order element, and an equivalent impedance can still carry several dynamic modes.
- A Tellegen-type identity (`sum v_k i_k = 0` over the branches) holds for any element types provided the flows satisfy conservation at nodes and the potentials derive from node potentials of the model. Whether economic value differences behave as node potentials, whether multi-asset exchange and liabilities are inside the model, and what `v * i` means economically, are premises the model must state. The identity therefore appears as a consistency check, not as a statement that Units conserve economic value.
- Time constants belong to configurations, not to elements. A capacitor has no `tau` by itself; `RC` does. "A staking pool is an inductor at a daily scale and a capacitor at a yearly scale" can be a useful approximation under a declared model; it is not a classification rule.
- Dimensions must be checked. If `q` is a token supply and `v` a price per token, `phi` has the unit of price times time, not of locked value times time. Capital occupation over a window is a separate quantity, `E = integral of LockedValue(t) dt`.
- Credit is not an ideal memristor. Credit terms depend on performance quality, concentration and external events, not only on cumulative volume; the memristive label is available only where the stated relation holds.

## How it is used

1. An analyst records a characterization assertion whose `models` member carries a statement under this profile, with `variables`, `elements`, `premises` and, optionally, `equivalents` and `consistency`.
2. A valuation method may consume such a model to generate or analyze cash flows (for example to produce the forecast of a finite-horizon DCF). The receipt then references the model statement among its inputs.
3. The example `agent-chip.characterization.json` carries a complete model statement for a running agent: a flow source at the service port, a capacitive treasury, a resistive compute cost, a controlled pricing policy and a switch at the operator's control port, with the window, operating range and linearization premises spelled out.

## Why keep it at all

Because it is useful. The circuit view gives analysts a compact, composable vocabulary for how value enters, is stored, is lost, is locked, is gated and is passed through an agent economy, and it anticipates exactly the packaged, multi-element "financial chips" that agents and swarms now are. The framework keeps that lineage as an explicit profile with explicit premises, so that readers who use it gain a shared model language and readers who do not use it lose nothing.
