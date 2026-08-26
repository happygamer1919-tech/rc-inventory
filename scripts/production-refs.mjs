// Refurile proiectelor Supabase care tin date reale de client.
//
// CRIT-11. Aceasta lista este citita de scripts/assert-not-prod.mjs, care
// refuza sa lase suita de teste sa porneasca impotriva vreunuia dintre ele.
//
// DE CE ESTE SCRISA AICI SI NU CITITA DIN MEDIU. Un ref de proiect nu este un
// secret: NEXT_PUBLIC_SUPABASE_URL il duce in pachetul JavaScript trimis
// fiecarui browser care deschide aplicatia, deci oricine a vazut ecranul de
// autentificare il stie deja. Daca lista ar veni din mediu, un mediu gol ar
// dezactiva paza exact in cazul in care paza este necesara, si un mediu gol este
// starea implicita a oricarui terminal nou.
//
// Cheia anonima si cea de service_role NU au ce cauta in acest fisier, si nici
// in altul din depozit. Aici sta numai identitatea proiectului.

export const PRODUCTION_REFS = [
  // Rapid Construct, eu-west-1. Proiectul pe care il serveste
  // https://www.rapidconstructmd.com si pe care il accepta clientul.
  "bwhzatwwjqmyfesfnisa",
];
