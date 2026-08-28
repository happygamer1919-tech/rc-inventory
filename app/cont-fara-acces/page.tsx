import type { Metadata } from "next";
import { SignOutButton } from "@/components/auth/SignOutButton";

export const metadata: Metadata = {
  title: "Cont fara acces - Rapid Construct",
};

// CRIT-17. Ecranul pentru un cont care s-a autentificat cu succes si nu are rand
// activ in profiles.
//
// STA IN AFARA GRUPULUI (app), ca si ecranul de autentificare, si asta este
// deliberat. Invelisul aplicatiei randeaza bara laterala si bara de sus, iar
// bara de sus arata rolul contului. Contul care ajunge aici NU ARE ROL, deci
// invelisul ar trebui sa randeze un meniu intreg in jurul unei absente. Un
// utilizator fara acces nu trebuie sa vada navigatia sistemului.
//
// PROXY-UL FACE REWRITE CATRE EL, NU REDIRECT. Aceeasi ratiune ca la ecranul
// 403: adresa ramane cea ceruta si nu poate aparea o bucla. Bucla pe care acest
// card o repara a existat exact pentru ca cele doua ramuri erau redirectari
// care se aratau una spre cealalta.
//
// BUTONUL DE IESIRE ESTE FUNCTIONALITATE, NU DECOR. Fara el, singura cale de a
// scapa de o sesiune care nu duce nicaieri este stergerea cookie-urilor din
// browser, ceea ce este exact ce a trebuit sa faca proprietarul cand a intalnit
// bucla.
export default function ContFaraAccesPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12 bg-rc-black text-rc-white">
      <div className="w-full max-w-[460px] text-center" data-testid="no-profile">
        <div className="inline-flex items-center justify-center rounded-xl bg-rc-white px-5 py-3 mb-6">
          <span className="text-rc-black font-semibold tracking-tight text-lg">
            Rapid Construct
          </span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">
          Contul nu are acces
        </h1>

        <p className="mt-3 text-sm text-rc-muted-2">
          Datele de autentificare sunt corecte, dar contul nu are un rol activ în
          sistemul de inventar, așa că nu poate deschide niciun ecran.
        </p>

        <p className="mt-3 text-sm text-rc-muted-2">
          Cere-i administratorului să îți activeze contul. Conturile și rolurile
          se creează manual, deci un cont nou nu are acces până nu i se dă unul.
        </p>

        <div className="mt-8 flex justify-center">
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
