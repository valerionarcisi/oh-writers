/**
 * Vehicles extractor — IT + EN lemma list.
 * Confidence ~70%, default `pending` (ghost tag).
 */

import { buildLemmaExtractor, type Lemma } from "./lemma-extractor.js";

const LEMMAS: readonly Lemma[] = [
  // Italian
  { display: "Macchina", stem: "macchin\\w*" },
  { display: "Auto", stem: "auto" },
  { display: "Suv", stem: "suv" },
  { display: "Camion", stem: "camion(cino)?" },
  { display: "Furgone", stem: "furgon\\w*" },
  { display: "Moto", stem: "moto(cicletta|cross)?" },
  { display: "Scooter", stem: "scooter" },
  { display: "Vespa", stem: "vespa" },
  { display: "Bicicletta", stem: "biciclett\\w*" },
  { display: "Bici", stem: "bici" },
  { display: "Taxi", stem: "tax[iì]" },
  { display: "Autobus", stem: "autobus" },
  { display: "Pullman", stem: "pullman" },
  { display: "Treno", stem: "tren\\w*" },
  { display: "Tram", stem: "tram" },
  { display: "Metropolitana", stem: "metro(politana)?" },
  { display: "Aereo", stem: "aere\\w*" },
  { display: "Elicottero", stem: "elicotter\\w*" },
  { display: "Barca", stem: "barc\\w*" },
  { display: "Nave", stem: "nav[ei]" },
  { display: "Gommone", stem: "gommon\\w*" },
  { display: "Yacht", stem: "yacht" },
  { display: "Scuolabus", stem: "scuolabus" },
  { display: "Ambulanza", stem: "ambulanz\\w*" },
  { display: "Volante", stem: "volant[ei]" },
  { display: "Carro funebre", stem: "carro\\s+funebre" },
  { display: "Carro attrezzi", stem: "carro\\s+attrezzi" },
  { display: "Trattore", stem: "trattor[ei]" },
  { display: "Limousine", stem: "limousine" },
  { display: "Caravan", stem: "caravan" },
  { display: "Camper", stem: "camper" },
  // English
  { display: "Car", stem: "cars?" },
  { display: "Truck", stem: "trucks?" },
  { display: "Van", stem: "vans?" },
  { display: "Motorcycle", stem: "motor(cycle|bike)s?" },
  { display: "Bicycle", stem: "bicycles?" },
  { display: "Bike", stem: "bikes?" },
  { display: "Cab", stem: "cabs?" },
  { display: "Bus", stem: "bus(es)?" },
  { display: "Train", stem: "trains?" },
  { display: "Subway", stem: "subways?" },
  { display: "Plane", stem: "planes?" },
  { display: "Airplane", stem: "airplanes?" },
  { display: "Helicopter", stem: "helicopters?" },
  { display: "Boat", stem: "boats?" },
  { display: "Ship", stem: "ships?" },
  { display: "Ambulance", stem: "ambulances?" },
  { display: "Hearse", stem: "hearses?" },
  { display: "Tractor", stem: "tractors?" },
  { display: "Limo", stem: "limos?" },
  { display: "RV", stem: "rv" },
  { display: "Police car", stem: "police\\s+cars?" },
  { display: "Fire truck", stem: "fire\\s+trucks?" },
];

export const extractVehicles = buildLemmaExtractor({
  category: "vehicles",
  defaultStatus: "pending",
  lemmas: LEMMAS,
});
