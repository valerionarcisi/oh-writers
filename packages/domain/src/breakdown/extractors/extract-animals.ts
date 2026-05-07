/**
 * Animals extractor — IT + EN lemma list.
 * Confidence ~90%, default `accepted`.
 */

import { buildLemmaExtractor, type Lemma } from "./lemma-extractor.js";

const LEMMAS: readonly Lemma[] = [
  // Italian
  { display: "Cane", stem: "can[ei]" },
  { display: "Cucciolo", stem: "cuccioli?" },
  { display: "Gatto", stem: "gatt[oi]" },
  { display: "Cavallo", stem: "caval[li]\\w*" },
  { display: "Pecora", stem: "pecor\\w*" },
  { display: "Mucca", stem: "mucc\\w*" },
  { display: "Vacca", stem: "vacc\\w*" },
  { display: "Toro", stem: "tor[oi]" },
  { display: "Capra", stem: "capr\\w*" },
  { display: "Maiale", stem: "maial\\w*" },
  { display: "Gallina", stem: "gallin\\w*" },
  { display: "Gallo", stem: "gall[oi]" },
  { display: "Pollo", stem: "poll[oi]" },
  { display: "Anatra", stem: "anatr\\w*" },
  { display: "Uccello", stem: "uccell\\w*" },
  { display: "Piccione", stem: "piccion\\w*" },
  { display: "Corvo", stem: "corv[oi]" },
  { display: "Gabbiano", stem: "gabbian\\w*" },
  { display: "Topo", stem: "top[oi]" },
  { display: "Ratto", stem: "ratt[oi]" },
  { display: "Coniglio", stem: "conigli?" },
  { display: "Serpente", stem: "serpent[ei]" },
  { display: "Ragno", stem: "ragn[oi]" },
  { display: "Ape", stem: "ap[ei]" },
  { display: "Mosca", stem: "mosch?\\w*" },
  { display: "Pesce", stem: "pesc[ei]" },
  { display: "Asino", stem: "asin[oi]" },
  { display: "Lupo", stem: "lup[oi]" },
  { display: "Volpe", stem: "volp[ei]" },
  { display: "Cervo", stem: "cerv[oi]" },
  // English
  { display: "Dog", stem: "dogs?" },
  { display: "Puppy", stem: "puppies|puppy" },
  { display: "Cat", stem: "cats?" },
  { display: "Horse", stem: "horses?" },
  { display: "Sheep", stem: "sheep" },
  { display: "Cow", stem: "cows?" },
  { display: "Bull", stem: "bulls?" },
  { display: "Goat", stem: "goats?" },
  { display: "Pig", stem: "pigs?" },
  { display: "Chicken", stem: "chickens?" },
  { display: "Rooster", stem: "roosters?" },
  { display: "Duck", stem: "ducks?" },
  { display: "Bird", stem: "birds?" },
  { display: "Pigeon", stem: "pigeons?" },
  { display: "Crow", stem: "crows?" },
  { display: "Seagull", stem: "seagulls?" },
  { display: "Mouse", stem: "mice|mouse" },
  { display: "Rat", stem: "rats?" },
  { display: "Rabbit", stem: "rabbits?" },
  { display: "Snake", stem: "snakes?" },
  { display: "Spider", stem: "spiders?" },
  { display: "Bee", stem: "bees?" },
  { display: "Fish", stem: "fish(es)?" },
  { display: "Donkey", stem: "donkeys?" },
  { display: "Wolf", stem: "wolves|wolf" },
  { display: "Fox", stem: "fox(es)?" },
  { display: "Deer", stem: "deer" },
];

export const extractAnimals = buildLemmaExtractor({
  category: "animals",
  defaultStatus: "accepted",
  lemmas: LEMMAS,
});
