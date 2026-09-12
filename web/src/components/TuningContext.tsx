"use client";

import { createContext, useContext } from "react";
import { STANDARD, type Tuning } from "@/lib/tuning";

/**
 * The active guitar tuning for chord diagrams and tab. Provided by `ResultView`
 * so `ChordName` (and the diagrams nested inside it) don't need it prop-drilled
 * through every chord sheet.
 */
const TuningContext = createContext<Tuning>(STANDARD);

export const TuningProvider = TuningContext.Provider;

export const useTuning = () => useContext(TuningContext);
