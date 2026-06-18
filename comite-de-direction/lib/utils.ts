import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatTon(value: number): string {
  return Math.round(value).toLocaleString("fr-FR").replace(/,/g, " ");
}

export function formatPdm(value: number): string {
  return value.toFixed(2).replace(".", ",") + " %";
}
