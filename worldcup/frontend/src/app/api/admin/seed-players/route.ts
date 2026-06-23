import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const API_BASE = "https://v3.football.api-sports.io";

interface MockPlayer {
  name: string;
  club: string;
  league: string;
  caps: number;
  goals: number;
}

const MOCK_PLAYERS: MockPlayer[] = [
  // ── ARGENTINA ────────────────────────────────────────────────────────────
  { name: "Lionel Messi",               club: "Inter Miami",        league: "MLS",              caps: 191, goals: 112 },
  { name: "Julián Álvarez",             club: "Atlético Madrid",    league: "La Liga",          caps: 50,  goals: 30  },
  { name: "Rodrigo De Paul",            club: "Atlético Madrid",    league: "La Liga",          caps: 75,  goals: 13  },
  { name: "Lautaro Martínez",           club: "Inter Milan",        league: "Serie A",          caps: 70,  goals: 40  },
  { name: "Enzo Fernández",             club: "Chelsea",            league: "Premier League",   caps: 50,  goals: 10  },
  { name: "Alexis Mac Allister",        club: "Liverpool",          league: "Premier League",   caps: 45,  goals: 10  },
  { name: "Federico Redondo",           club: "Inter Miami",        league: "MLS",              caps: 12,  goals: 1   },
  { name: "Emiliano Martínez",          club: "Aston Villa",        league: "Premier League",   caps: 50,  goals: 0   },
  { name: "Nicolás González",           club: "Juventus",           league: "Serie A",          caps: 35,  goals: 10  },
  { name: "Germán Pezzella",            club: "Real Betis",         league: "La Liga",          caps: 40,  goals: 4   },
  { name: "Nahuel Molina",              club: "Atlético Madrid",    league: "La Liga",          caps: 40,  goals: 5   },
  { name: "Leandro Paredes",            club: "AS Roma",            league: "Serie A",          caps: 60,  goals: 8   },

  // ── BRAZIL ────────────────────────────────────────────────────────────────
  { name: "Vinicius Jr.",               club: "Real Madrid",        league: "La Liga",          caps: 65,  goals: 28  },
  { name: "Rodrygo",                    club: "Real Madrid",        league: "La Liga",          caps: 45,  goals: 18  },
  { name: "Raphinha",                   club: "Barcelona",          league: "La Liga",          caps: 55,  goals: 23  },
  { name: "Endrick",                    club: "Real Madrid",        league: "La Liga",          caps: 20,  goals: 8   },
  { name: "Lucas Paquetá",              club: "West Ham",           league: "Premier League",   caps: 55,  goals: 11  },
  { name: "Marquinhos",                 club: "PSG",                league: "Ligue 1",          caps: 90,  goals: 8   },
  { name: "Alisson Becker",             club: "Liverpool",          league: "Premier League",   caps: 75,  goals: 0   },
  { name: "Bruno Guimarães",            club: "Newcastle",          league: "Premier League",   caps: 40,  goals: 5   },
  { name: "Gabriel Martinelli",         club: "Arsenal",            league: "Premier League",   caps: 30,  goals: 8   },
  { name: "Danilo",                     club: "Juventus",           league: "Serie A",          caps: 75,  goals: 5   },

  // ── ENGLAND ───────────────────────────────────────────────────────────────
  { name: "Jude Bellingham",            club: "Real Madrid",        league: "La Liga",          caps: 60,  goals: 18  },
  { name: "Harry Kane",                 club: "Bayern Munich",      league: "Bundesliga",       caps: 100, goals: 70  },
  { name: "Phil Foden",                 club: "Manchester City",    league: "Premier League",   caps: 50,  goals: 14  },
  { name: "Bukayo Saka",                club: "Arsenal",            league: "Premier League",   caps: 52,  goals: 20  },
  { name: "Declan Rice",                club: "Arsenal",            league: "Premier League",   caps: 55,  goals: 6   },
  { name: "Marcus Rashford",            club: "Barcelona",          league: "La Liga",          caps: 65,  goals: 18  },
  { name: "Trent Alexander-Arnold",     club: "Real Madrid",        league: "La Liga",          caps: 48,  goals: 5   },
  { name: "Jordan Pickford",            club: "Everton",            league: "Premier League",   caps: 65,  goals: 0   },
  { name: "John Stones",                club: "Manchester City",    league: "Premier League",   caps: 70,  goals: 7   },
  { name: "Cole Palmer",                club: "Chelsea",            league: "Premier League",   caps: 25,  goals: 9   },

  // ── FRANCE ────────────────────────────────────────────────────────────────
  { name: "Kylian Mbappé",              club: "Real Madrid",        league: "La Liga",          caps: 105, goals: 50  },
  { name: "Antoine Griezmann",          club: "Atlético Madrid",    league: "La Liga",          caps: 138, goals: 46  },
  { name: "Ousmane Dembélé",            club: "PSG",                league: "Ligue 1",          caps: 65,  goals: 16  },
  { name: "N'Golo Kanté",               club: "Al-Ittihad",         league: "Saudi Pro League", caps: 75,  goals: 2   },
  { name: "Aurelien Tchouameni",        club: "Real Madrid",        league: "La Liga",          caps: 42,  goals: 5   },
  { name: "Eduardo Camavinga",          club: "Real Madrid",        league: "La Liga",          caps: 32,  goals: 3   },
  { name: "Theo Hernandez",             club: "AC Milan",           league: "Serie A",          caps: 38,  goals: 9   },
  { name: "Mike Maignan",               club: "AC Milan",           league: "Serie A",          caps: 32,  goals: 0   },
  { name: "William Saliba",             club: "Arsenal",            league: "Premier League",   caps: 28,  goals: 2   },

  // ── SPAIN ─────────────────────────────────────────────────────────────────
  { name: "Lamine Yamal",               club: "Barcelona",          league: "La Liga",          caps: 28,  goals: 9   },
  { name: "Pedri",                      club: "Barcelona",          league: "La Liga",          caps: 55,  goals: 7   },
  { name: "Rodri",                      club: "Manchester City",    league: "Premier League",   caps: 65,  goals: 12  },
  { name: "Álvaro Morata",              club: "AC Milan",           league: "Serie A",          caps: 88,  goals: 38  },
  { name: "Nico Williams",              club: "Athletic Club",      league: "La Liga",          caps: 25,  goals: 6   },
  { name: "Riqui Puig",                 club: "Inter Miami",        league: "MLS",              caps: 22,  goals: 4   },
  { name: "Fabian Ruiz",                club: "PSG",                league: "Ligue 1",          caps: 45,  goals: 6   },
  { name: "Dani Olmo",                  club: "Barcelona",          league: "La Liga",          caps: 50,  goals: 16  },
  { name: "Marc Cucurella",             club: "Chelsea",            league: "Premier League",   caps: 28,  goals: 2   },
  { name: "Unai Simon",                 club: "Athletic Club",      league: "La Liga",          caps: 38,  goals: 0   },
  { name: "Robin Le Normand",           club: "Atlético Madrid",    league: "La Liga",          caps: 18,  goals: 2   },

  // ── PORTUGAL ──────────────────────────────────────────────────────────────
  { name: "Cristiano Ronaldo",          club: "Al-Nassr",           league: "Saudi Pro League", caps: 220, goals: 140 },
  { name: "Bruno Fernandes",            club: "Manchester United",  league: "Premier League",   caps: 85,  goals: 26  },
  { name: "Rafael Leão",                club: "AC Milan",           league: "Serie A",          caps: 45,  goals: 14  },
  { name: "Bernardo Silva",             club: "Manchester City",    league: "Premier League",   caps: 90,  goals: 19  },
  { name: "João Félix",                 club: "Chelsea",            league: "Premier League",   caps: 50,  goals: 13  },
  { name: "Rúben Dias",                 club: "Manchester City",    league: "Premier League",   caps: 68,  goals: 5   },
  { name: "Diogo Jota",                 club: "Liverpool",          league: "Premier League",   caps: 58,  goals: 23  },
  { name: "Vitinha",                    club: "PSG",                league: "Ligue 1",          caps: 38,  goals: 5   },
  { name: "Pedro Neto",                 club: "Chelsea",            league: "Premier League",   caps: 32,  goals: 9   },
  { name: "João Cancelo",               club: "Barcelona",          league: "La Liga",          caps: 55,  goals: 6   },

  // ── GERMANY ───────────────────────────────────────────────────────────────
  { name: "Florian Wirtz",              club: "Bayer Leverkusen",   league: "Bundesliga",       caps: 40,  goals: 15  },
  { name: "Jamal Musiala",              club: "Bayern Munich",      league: "Bundesliga",       caps: 52,  goals: 18  },
  { name: "Kai Havertz",                club: "Arsenal",            league: "Premier League",   caps: 62,  goals: 24  },
  { name: "Joshua Kimmich",             club: "Bayern Munich",      league: "Bundesliga",       caps: 90,  goals: 12  },
  { name: "Antonio Rüdiger",            club: "Real Madrid",        league: "La Liga",          caps: 70,  goals: 6   },
  { name: "Leroy Sané",                 club: "Bayern Munich",      league: "Bundesliga",       caps: 60,  goals: 13  },
  { name: "Niclas Füllkrug",            club: "West Ham",           league: "Premier League",   caps: 28,  goals: 14  },
  { name: "Manuel Neuer",               club: "Bayern Munich",      league: "Bundesliga",       caps: 120, goals: 0   },
  { name: "Ilkay Gündogan",             club: "Barcelona",          league: "La Liga",          caps: 72,  goals: 18  },

  // ── NETHERLANDS ───────────────────────────────────────────────────────────
  { name: "Virgil van Dijk",            club: "Liverpool",          league: "Premier League",   caps: 78,  goals: 9   },
  { name: "Cody Gakpo",                 club: "Liverpool",          league: "Premier League",   caps: 48,  goals: 18  },
  { name: "Xavi Simons",                club: "PSG",                league: "Ligue 1",          caps: 30,  goals: 8   },
  { name: "Ryan Gravenberch",           club: "Liverpool",          league: "Premier League",   caps: 22,  goals: 3   },
  { name: "Denzel Dumfries",            club: "Inter Milan",        league: "Serie A",          caps: 58,  goals: 9   },
  { name: "Memphis Depay",              club: "Corinthians",        league: "Brasileirao",      caps: 100, goals: 46  },
  { name: "Stefan de Vrij",             club: "Inter Milan",        league: "Serie A",          caps: 55,  goals: 5   },

  // ── MOROCCO ───────────────────────────────────────────────────────────────
  { name: "Achraf Hakimi",              club: "PSG",                league: "Ligue 1",          caps: 88,  goals: 17  },
  { name: "Hakim Ziyech",               club: "Galatasaray",        league: "Süper Lig",        caps: 75,  goals: 22  },
  { name: "Youssef En-Nesyri",          club: "Fenerbahce",         league: "Süper Lig",        caps: 58,  goals: 24  },
  { name: "Sofyan Amrabat",             club: "Fiorentina",         league: "Serie A",          caps: 55,  goals: 2   },
  { name: "Noussair Mazraoui",          club: "Manchester United",  league: "Premier League",   caps: 40,  goals: 4   },

  // ── JAPAN ─────────────────────────────────────────────────────────────────
  { name: "Takefusa Kubo",              club: "Real Sociedad",      league: "La Liga",          caps: 55,  goals: 13  },
  { name: "Kaoru Mitoma",               club: "Brighton",           league: "Premier League",   caps: 38,  goals: 10  },
  { name: "Wataru Endo",                club: "Liverpool",          league: "Premier League",   caps: 58,  goals: 5   },
  { name: "Daichi Kamada",              club: "Crystal Palace",     league: "Premier League",   caps: 48,  goals: 12  },
  { name: "Ritsu Doan",                 club: "SC Freiburg",        league: "Bundesliga",       caps: 45,  goals: 13  },
  { name: "Hiroki Ito",                 club: "Bayern Munich",      league: "Bundesliga",       caps: 28,  goals: 3   },

  // ── USA ───────────────────────────────────────────────────────────────────
  { name: "Christian Pulisic",          club: "AC Milan",           league: "Serie A",          caps: 75,  goals: 27  },
  { name: "Tyler Adams",                club: "Bournemouth",        league: "Premier League",   caps: 50,  goals: 4   },
  { name: "Weston McKennie",            club: "Juventus",           league: "Serie A",          caps: 55,  goals: 11  },
  { name: "Giovanni Reyna",             club: "Nottingham Forest",  league: "Premier League",   caps: 32,  goals: 7   },
  { name: "Tim Weah",                   club: "Juventus",           league: "Serie A",          caps: 32,  goals: 6   },
  { name: "Antonee Robinson",           club: "Fulham",             league: "Premier League",   caps: 45,  goals: 5   },
  { name: "Folarin Balogun",            club: "Monaco",             league: "Ligue 1",          caps: 20,  goals: 8   },
  { name: "Matt Turner",                club: "Crystal Palace",     league: "Premier League",   caps: 42,  goals: 0   },

  // ── MEXICO ────────────────────────────────────────────────────────────────
  { name: "Hirving Lozano",             club: "PSV",                league: "Eredivisie",       caps: 85,  goals: 30  },
  { name: "Edson Álvarez",              club: "West Ham",           league: "Premier League",   caps: 75,  goals: 7   },
  { name: "Santiago Giménez",           club: "AC Milan",           league: "Serie A",          caps: 32,  goals: 17  },
  { name: "Alexis Vega",                club: "Guadalajara",        league: "Liga MX",          caps: 48,  goals: 16  },
  { name: "Guillermo Ochoa",            club: "América",            league: "Liga MX",          caps: 145, goals: 0   },
  { name: "Raúl Jiménez",               club: "Fulham",             league: "Premier League",   caps: 100, goals: 35  },
  { name: "César Montes",               club: "Espanyol",           league: "La Liga",          caps: 45,  goals: 5   },

  // ── CANADA ────────────────────────────────────────────────────────────────
  { name: "Alphonso Davies",            club: "Bayern Munich",      league: "Bundesliga",       caps: 60,  goals: 14  },
  { name: "Jonathan David",             club: "Lille",              league: "Ligue 1",          caps: 50,  goals: 33  },
  { name: "Tajon Buchanan",             club: "Inter Milan",        league: "Serie A",          caps: 38,  goals: 7   },
  { name: "Cyle Larin",                 club: "Valladolid",         league: "La Liga",          caps: 58,  goals: 28  },
  { name: "Atiba Hutchinson",           club: "CF Montréal",        league: "MLS",              caps: 110, goals: 12  },

  // ── COLOMBIA ──────────────────────────────────────────────────────────────
  { name: "Luis Díaz",                  club: "Liverpool",          league: "Premier League",   caps: 55,  goals: 21  },
  { name: "James Rodríguez",            club: "Rayo Vallecano",     league: "La Liga",          caps: 100, goals: 30  },
  { name: "Jhon Durán",                 club: "Aston Villa",        league: "Premier League",   caps: 18,  goals: 8   },
  { name: "Richard Ríos",               club: "Palmeiras",          league: "Brasileirao",      caps: 25,  goals: 4   },
  { name: "Yerson Mosquera",            club: "Wolverhampton",      league: "Premier League",   caps: 20,  goals: 2   },
  { name: "Luis Sinisterra",            club: "Bournemouth",        league: "Premier League",   caps: 32,  goals: 9   },

  // ── URUGUAY ───────────────────────────────────────────────────────────────
  { name: "Darwin Núñez",               club: "Liverpool",          league: "Premier League",   caps: 52,  goals: 25  },
  { name: "Federico Valverde",          club: "Real Madrid",        league: "La Liga",          caps: 65,  goals: 18  },
  { name: "Rodrigo Bentancur",          club: "Tottenham",          league: "Premier League",   caps: 58,  goals: 6   },
  { name: "Ronald Araújo",              club: "Barcelona",          league: "La Liga",          caps: 38,  goals: 4   },
  { name: "José María Giménez",         club: "Atlético Madrid",    league: "La Liga",          caps: 65,  goals: 5   },
  { name: "Manuel Ugarte",              club: "Manchester United",  league: "Premier League",   caps: 30,  goals: 2   },

  // ── SOUTH KOREA ───────────────────────────────────────────────────────────
  { name: "Son Heung-min",              club: "Tottenham",          league: "Premier League",   caps: 120, goals: 40  },
  { name: "Lee Kang-in",                club: "PSG",                league: "Ligue 1",          caps: 42,  goals: 10  },
  { name: "Kim Min-jae",                club: "Bayern Munich",      league: "Bundesliga",       caps: 52,  goals: 3   },
  { name: "Hwang Hee-chan",              club: "Wolverhampton",      league: "Premier League",   caps: 58,  goals: 18  },
  { name: "Cho Gue-sung",               club: "Midtjylland",        league: "Danish Superliga", caps: 28,  goals: 12  },

  // ── SENEGAL ───────────────────────────────────────────────────────────────
  { name: "Sadio Mané",                 club: "Al-Nassr",           league: "Saudi Pro League", caps: 100, goals: 36  },
  { name: "Ismaïla Sarr",               club: "Crystal Palace",     league: "Premier League",   caps: 52,  goals: 15  },
  { name: "Kalidou Koulibaly",          club: "Al-Hilal",           league: "Saudi Pro League", caps: 78,  goals: 5   },
  { name: "Idrissa Gana Gueye",         club: "Everton",            league: "Premier League",   caps: 85,  goals: 5   },
  { name: "Boulaye Dia",                club: "Lazio",              league: "Serie A",          caps: 30,  goals: 11  },

  // ── AUSTRALIA ─────────────────────────────────────────────────────────────
  { name: "Mathew Ryan",                club: "Real Sociedad",      league: "La Liga",          caps: 90,  goals: 0   },
  { name: "Mitchell Duke",              club: "Urawa Red Diamonds", league: "J.League",         caps: 42,  goals: 13  },
  { name: "Martin Boyle",               club: "Panathinaikos",      league: "Super League",     caps: 48,  goals: 14  },
  { name: "Jackson Irvine",             club: "FC St. Pauli",       league: "Bundesliga",       caps: 75,  goals: 11  },

  // ── CROATIA ───────────────────────────────────────────────────────────────
  { name: "Luka Modrić",                club: "Real Madrid",        league: "La Liga",          caps: 180, goals: 25  },
  { name: "Marcelo Brozović",           club: "Al-Nassr",           league: "Saudi Pro League", caps: 95,  goals: 12  },
  { name: "Mateo Kovačić",              club: "Manchester City",    league: "Premier League",   caps: 92,  goals: 7   },
  { name: "Ivan Perišić",               club: "Hajduk Split",       league: "HNL",              caps: 125, goals: 34  },
  { name: "Andrej Kramarić",            club: "Hoffenheim",         league: "Bundesliga",       caps: 75,  goals: 22  },

  // ── POLAND ────────────────────────────────────────────────────────────────
  { name: "Robert Lewandowski",         club: "Barcelona",          league: "La Liga",          caps: 145, goals: 85  },
  { name: "Piotr Zielinski",            club: "Inter Milan",        league: "Serie A",          caps: 82,  goals: 19  },
  { name: "Nicola Zalewski",            club: "AS Roma",            league: "Serie A",          caps: 28,  goals: 4   },
  { name: "Wojciech Szczesny",          club: "Barcelona",          league: "La Liga",          caps: 82,  goals: 0   },
  { name: "Jakub Kiwior",               club: "Arsenal",            league: "Premier League",   caps: 22,  goals: 1   },

  // ── ECUADOR ───────────────────────────────────────────────────────────────
  { name: "Enner Valencia",             club: "Internacional",      league: "Brasileirao",      caps: 90,  goals: 42  },
  { name: "Moisés Caicedo",             club: "Chelsea",            league: "Premier League",   caps: 45,  goals: 5   },
  { name: "Gonzalo Plata",              club: "Sporting CP",        league: "Primeira Liga",    caps: 38,  goals: 9   },
  { name: "Ángel Mena",                 club: "León",               league: "Liga MX",          caps: 55,  goals: 12  },

  // ── GHANA ─────────────────────────────────────────────────────────────────
  { name: "Mohammed Kudus",             club: "West Ham",           league: "Premier League",   caps: 38,  goals: 12  },
  { name: "Jordan Ayew",                club: "Leicester City",     league: "Premier League",   caps: 95,  goals: 22  },
  { name: "Thomas Partey",              club: "Arsenal",            league: "Premier League",   caps: 52,  goals: 13  },
  { name: "Antoine Semenyo",            club: "Bournemouth",        league: "Premier League",   caps: 18,  goals: 6   },

  // ── SWITZERLAND ───────────────────────────────────────────────────────────
  { name: "Granit Xhaka",               club: "Bayer Leverkusen",   league: "Bundesliga",       caps: 125, goals: 13  },
  { name: "Breel Embolo",               club: "Monaco",             league: "Ligue 1",          caps: 55,  goals: 16  },
  { name: "Xherdan Shaqiri",            club: "Chicago Fire",       league: "MLS",              caps: 112, goals: 33  },
  { name: "Remo Freuler",               club: "Nottingham Forest",  league: "Premier League",   caps: 60,  goals: 5   },

  // ── CAMEROON ──────────────────────────────────────────────────────────────
  { name: "André-Frank Zambo Anguissa", club: "Napoli",             league: "Serie A",          caps: 58,  goals: 5   },
  { name: "Vincent Aboubakar",          club: "Al-Qadsiah",         league: "Saudi Pro League", caps: 100, goals: 40  },
  { name: "Eric Maxim Choupo-Moting",   club: "Bayern Munich",      league: "Bundesliga",       caps: 60,  goals: 11  },
  { name: "Karl Toko Ekambi",           club: "Rennes",             league: "Ligue 1",          caps: 55,  goals: 18  },

  // ── NIGERIA ───────────────────────────────────────────────────────────────
  { name: "Victor Osimhen",             club: "Napoli",             league: "Serie A",          caps: 55,  goals: 27  },
  { name: "Wilfred Ndidi",              club: "Leicester City",     league: "Premier League",   caps: 65,  goals: 2   },
  { name: "Samuel Chukwueze",           club: "AC Milan",           league: "Serie A",          caps: 48,  goals: 13  },
  { name: "Ademola Lookman",            club: "Atalanta",           league: "Serie A",          caps: 30,  goals: 10  },
  { name: "Alex Iwobi",                 club: "Fulham",             league: "Premier League",   caps: 58,  goals: 10  },

  // ── SAUDI ARABIA ──────────────────────────────────────────────────────────
  { name: "Salem Al-Dawsari",           club: "Al-Hilal",           league: "Saudi Pro League", caps: 82,  goals: 28  },
  { name: "Saleh Al-Shehri",            club: "Al-Hilal",           league: "Saudi Pro League", caps: 38,  goals: 15  },
  { name: "Mohammed Al-Owais",          club: "Al-Hilal",           league: "Saudi Pro League", caps: 42,  goals: 0   },
  { name: "Firas Al-Buraikan",          club: "Al-Qadsiah",         league: "Saudi Pro League", caps: 32,  goals: 14  },

  // ── IRAN ──────────────────────────────────────────────────────────────────
  { name: "Mehdi Taremi",               club: "Inter Milan",        league: "Serie A",          caps: 85,  goals: 48  },
  { name: "Sardar Azmoun",              club: "Bayer Leverkusen",   league: "Bundesliga",       caps: 82,  goals: 48  },
  { name: "Alireza Jahanbakhsh",        club: "Feyenoord",          league: "Eredivisie",       caps: 98,  goals: 21  },

  // ── IVORY COAST ───────────────────────────────────────────────────────────
  { name: "Sébastien Haller",           club: "Borussia Dortmund",  league: "Bundesliga",       caps: 42,  goals: 17  },
  { name: "Franck Kessié",              club: "Barcelona",          league: "La Liga",          caps: 68,  goals: 12  },
  { name: "Nicolas Pépé",               club: "Nice",               league: "Ligue 1",          caps: 55,  goals: 15  },
  { name: "Wilfried Zaha",              club: "Al-Qadsiah",         league: "Saudi Pro League", caps: 30,  goals: 6   },

  // ── BELGIUM ───────────────────────────────────────────────────────────────
  { name: "Kevin De Bruyne",            club: "Manchester City",    league: "Premier League",   caps: 105, goals: 28  },
  { name: "Romelu Lukaku",              club: "Napoli",             league: "Serie A",          caps: 115, goals: 70  },
  { name: "Youri Tielemans",            club: "Aston Villa",        league: "Premier League",   caps: 78,  goals: 16  },
  { name: "Jeremy Doku",                club: "Manchester City",    league: "Premier League",   caps: 32,  goals: 5   },
  { name: "Lois Openda",                club: "RB Leipzig",         league: "Bundesliga",       caps: 28,  goals: 12  },

  // ── DENMARK ───────────────────────────────────────────────────────────────
  { name: "Christian Eriksen",          club: "Manchester United",  league: "Premier League",   caps: 135, goals: 42  },
  { name: "Rasmus Højlund",             club: "Manchester United",  league: "Premier League",   caps: 28,  goals: 14  },
  { name: "Pierre-Emile Højbjerg",      club: "Marseille",          league: "Ligue 1",          caps: 85,  goals: 8   },
  { name: "Mikkel Damsgaard",           club: "Brentford",          league: "Premier League",   caps: 32,  goals: 7   },

  // ── SERBIA ────────────────────────────────────────────────────────────────
  { name: "Dušan Vlahović",             club: "Juventus",           league: "Serie A",          caps: 45,  goals: 22  },
  { name: "Aleksandar Mitrović",        club: "Al-Hilal",           league: "Saudi Pro League", caps: 85,  goals: 58  },
  { name: "Sergej Milinković-Savić",    club: "Al-Hilal",           league: "Saudi Pro League", caps: 65,  goals: 16  },
  { name: "Dušan Tadić",                club: "Fenerbahce",         league: "Süper Lig",        caps: 95,  goals: 19  },

  // ── PANAMA ────────────────────────────────────────────────────────────────
  { name: "Ismael Díaz",                club: "Girona",             league: "La Liga",          caps: 20,  goals: 5   },
  { name: "Rolando Blackburn",          club: "Panamá",             league: "LPF",              caps: 35,  goals: 8   },
  { name: "César Yanis",                club: "Panamá",             league: "LPF",              caps: 25,  goals: 6   },

  // ── VENEZUELA ─────────────────────────────────────────────────────────────
  { name: "Josef Martínez",             club: "Inter Miami",        league: "MLS",              caps: 52,  goals: 24  },
  { name: "Salomón Rondón",             club: "Vasco da Gama",      league: "Brasileirao",      caps: 90,  goals: 40  },
  { name: "Yangel Herrera",             club: "Girona",             league: "La Liga",          caps: 55,  goals: 12  },
  { name: "Yeferson Soteldo",           club: "Santos",             league: "Brasileirao",      caps: 42,  goals: 8   },

  // ── EGYPT ─────────────────────────────────────────────────────────────────
  { name: "Mohamed Salah",              club: "Liverpool",          league: "Premier League",   caps: 100, goals: 56  },
  { name: "Trezeguet",                  club: "Kasımpaşa",          league: "Süper Lig",        caps: 65,  goals: 18  },
  { name: "Mostafa Mohamed",            club: "Galatasaray",        league: "Süper Lig",        caps: 35,  goals: 12  },
];

async function seedMock() {
  const dbPlayers = await prisma.player.findMany();
  let updated = 0;
  const notFound: string[] = [];

  for (const mock of MOCK_PLAYERS) {
    const nameLower = mock.name.toLowerCase();
    const match = dbPlayers.find((p) =>
      p.name.toLowerCase().includes(nameLower) ||
      nameLower.includes(p.name.toLowerCase())
    );

    if (match) {
      await prisma.player.update({
        where: { id: match.id },
        data: {
          club: mock.club,
          league: mock.league,
          caps: mock.caps,
          goals: mock.goals,
        },
      });
      updated++;
    } else {
      notFound.push(mock.name);
    }
  }

  return { updated, notFound };
}

async function seedFromApi() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API_FOOTBALL_KEY not configured" }, { status: 500 });
  }

  const headers = { "x-apisports-key": apiKey };

  // Step 1: Get all fixtures from DB to find api-football fixture IDs
  const matches = await prisma.match.findMany({ select: { fixture: true } });
  if (matches.length === 0) {
    return NextResponse.json({ error: "No matches in DB" }, { status: 400 });
  }

  // Step 2: For each fixture, call api-football to get team IDs
  const apiTeamIds = new Set<number>();
  // Sample at most 10 fixtures to reduce quota usage
  const sampleFixtures = matches.slice(0, 10);

  for (const m of sampleFixtures) {
    try {
      const res = await fetch(`${API_BASE}/fixtures?id=${m.fixture}`, { headers });
      const data = await res.json() as { response: Array<{ teams: { home: { id: number }; away: { id: number } } }> };
      if (data.response?.[0]) {
        apiTeamIds.add(data.response[0].teams.home.id);
        apiTeamIds.add(data.response[0].teams.away.id);
      }
    } catch {
      // skip on error
    }
  }

  if (apiTeamIds.size === 0) {
    return NextResponse.json({ error: "Could not extract team IDs from fixtures" }, { status: 500 });
  }

  // Step 3: For each team, fetch players with stats (includes club info)
  interface ApiPlayer {
    player: { id: number; name: string; age: number; photo: string; birth: { date: string } };
    statistics: Array<{ team: { name: string }; league: { name: string }; games: { appearences: number }; goals: { total: number } }>;
  }

  const playerMap = new Map<string, { club: string; league: string; caps: number; goals: number; photoUrl: string; dateOfBirth: string }>();

  for (const teamId of apiTeamIds) {
    try {
      const res = await fetch(`${API_BASE}/players?team=${teamId}&league=1&season=2026`, { headers });
      const data = await res.json() as { response: ApiPlayer[] };
      for (const entry of data.response ?? []) {
        const stat = entry.statistics?.[0];
        if (!stat) continue;
        playerMap.set(entry.player.name.toLowerCase(), {
          club: stat.team.name,
          league: stat.league.name,
          caps: stat.games.appearences ?? 0,
          goals: stat.goals.total ?? 0,
          photoUrl: entry.player.photo ?? "",
          dateOfBirth: entry.player.birth?.date ?? "",
        });
      }
    } catch {
      // skip on error
    }
  }

  // Step 4: Match to DB players and update
  const dbPlayers = await prisma.player.findMany();
  let updated = 0;
  const notFound: string[] = [];

  for (const dbPlayer of dbPlayers) {
    const nameLower = dbPlayer.name.toLowerCase();
    const found = playerMap.get(nameLower);
    if (found) {
      await prisma.player.update({
        where: { id: dbPlayer.id },
        data: {
          club: found.club,
          league: found.league,
          caps: found.caps,
          goals: found.goals,
          photoUrl: found.photoUrl || undefined,
          dateOfBirth: found.dateOfBirth,
        },
      });
      updated++;
    } else {
      notFound.push(dbPlayer.name);
    }
  }

  return NextResponse.json({ updated, notFound, teamsScanned: apiTeamIds.size });
}

async function handler(req: Request) {
  const session = await auth();
  if (session?.user?.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const mock = searchParams.get("mock") === "true";

  if (mock) {
    const result = await seedMock();
    return NextResponse.json(result);
  }

  return seedFromApi();
}

export async function GET(req: Request) { return handler(req); }
export async function POST(req: Request) { return handler(req); }
