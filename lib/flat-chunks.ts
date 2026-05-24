// Simulated flat-retrieval chunks per query intent. Each chunk lumps the
// relevant passage together with adjacent text from the same source — what a
// plain top-k vector search over a chunked legal corpus would return. The
// API uses these to compute the flat-side token count; the UI renders them
// in the "View context" panel of the comparison card.

export type FlatChunk = {
  id: string;
  source: string;
  text: string;
};

export const FLAT_CHUNKS_BY_INTENT: Record<string, FlatChunk[]> = {
  "freelancer-b2b-vat": [
    {
      id: "fr-c1",
      source: "Arvonlisäverolaki 1501/1993, 1. luku",
      text:
        "Arvonlisävero on yleinen kulutusvero, jota suoritetaan tavaroiden ja palvelujen myynnistä Suomessa. Arvonlisäveroa suoritetaan tämän lain mukaan liiketoiminnan muodossa Suomessa tapahtuvasta tavaran ja palvelun myynnistä sekä Suomessa tapahtuvasta yhteisöhankinnasta ja maahantuonnista. Velvollinen suorittamaan veroa 1 §:ssä tarkoitetusta myynnistä on tavaran tai palvelun myyjä, jollei 2 a, 8 a–8 d tai 9 §:ssä toisin säädetä. Myyjä ei kuitenkaan ole verovelvollinen, jos tilikauden liikevaihto on enintään 15 000 euroa, ellei häntä ole oman ilmoituksen perusteella merkitty verovelvolliseksi.",
    },
    {
      id: "fr-c2",
      source: "AVL 5. luku — palvelujen myyntimaa",
      text:
        "Palvelujen myyntimaata koskevat säännökset ovat AVL 64–69 §:issä. Elinkeinonharjoittajalle luovutettu palvelu on myyty Suomessa, jos se luovutetaan ostajan täällä sijaitsevaan kiinteään toimipaikkaan. Jos palvelua ei luovuteta kiinteään toimipaikkaan, se on myyty Suomessa, jos ostajan kotipaikka on täällä. Kiinteistöön kohdistuva palvelu on myyty siellä, missä kiinteistö sijaitsee. Kuljetuspalveluihin sovelletaan erillisiä säännöksiä. Muulle kuin elinkeinonharjoittajalle luovutettu sähköinen palvelu on myyty Suomessa, jos ostaja on sijoittautunut Suomeen.",
    },
    {
      id: "fr-c3",
      source: "Verohallinto — palvelujen ulkomaankauppa",
      text:
        "Verohallinnon ohje käsittelee palvelujen ulkomaankaupan arvonlisäverotusta laajasti. Elinkeinonharjoittajien välisessä palvelukaupassa pääsääntönä on, että palvelu verotetaan ostajan sijoittautumisvaltiossa. Suomalainen myyjä ei tällöin lisää laskuun Suomen arvonlisäveroa, vaan käyttää käännettyä verovelvollisuutta. Kuluttajalle myynnissä sovelletaan eri sääntöjä — palvelu verotetaan myyjän sijoittautumisvaltiossa. Verkkokaupassa ja sähköisissä palveluissa on omat erityissäännökset. Ohjeessa käsitellään myös kiinteistöpalveluja, kuljetuspalveluja ja ravintolapalveluja erikseen.",
    },
    {
      id: "fr-c4",
      source: "KHO ratkaisuja — myyntimaa ja verovelvollisuus",
      text:
        "Korkein hallinto-oikeus on antanut useita ratkaisuja palvelujen myyntimaata koskien. KHO:2019:42: Suomalainen yhtiö myi konsultointipalveluja saksalaiselle elinkeinonharjoittajalle. KHO katsoi, että palvelu oli myyty ostajan sijoittautumisvaltiossa ja että suomalainen myyjä ei ollut velvollinen suorittamaan Suomen arvonlisäveroa. Muissa ratkaisuissa on käsitelty kiinteistöpalveluja, joissa ratkaisevaa on kiinteistön sijaintipaikka.",
    },
    {
      id: "fr-c5",
      source: "Neuvoston direktiivi 2006/112/EY",
      text:
        "EU:n arvonlisäverodirektiivi (2006/112/EY) yhdenmukaistaa jäsenvaltioiden arvonlisäverotusta. Direktiivin 44 artiklan mukaan elinkeinonharjoittajalle luovutetun palvelun myyntimaa on ostajan sijoittautumisvaltio. Direktiivin 45 artikla koskee kuluttajamyyntiä. Pienyrityksiä koskevat omat 282 artiklan mukaiset poikkeukset. Direktiivin 46–59 artiklat sisältävät erityissäännöksiä mm. kuljetuspalveluille ja sähköisille palveluille.",
    },
  ],

  "vehicle-input-vat": [
    {
      id: "ve-c1",
      source: "AVL 10. luku — vähennysoikeus (yleisperustelut)",
      text:
        "Verovelvollinen saa vähentää verollista liiketoimintaa varten toiselta verovelvolliselta ostamastaan tavarasta tai palvelusta suoritettavan veron taikka ostosta 8 a–8 c tai 9 §:n perusteella suoritettavan veron. Vähennysoikeuden edellytyksenä on, että hankinta liittyy verovelvollisen verolliseen liiketoimintaan. Vähennystä ei kuitenkaan saa tehdä, kun hankinta koskee verovelvollisen tai hänen henkilökuntansa yksityistä käyttöä, edustusmenoja, asunnon ja työpaikan välistä kuljetusta tai henkilöauton hankintaa ja käyttöä. Vähennysoikeudesta voi seurata myös oikaisuvelvollisuus, jos hankintaa myöhemmin käytetään muuhun kuin verolliseen toimintaan. Kuluttajalle myynti ja verottomat toimet eivät pääsääntöisesti synnytä vähennysoikeutta.",
    },
    {
      id: "ve-c2",
      source: "AVL § 114 ja 114 a — henkilöauton vähennysrajoitus",
      text:
        "AVL 114 § sisältää yleiset vähennysrajoitukset, jotka koskevat muun muassa edustusmenoja, työmatkan ja asunnon välistä kuljetusta sekä henkilöauton hankintaa. Henkilöauton hankinta-, vuokraus- ja käyttömenojen arvonlisävero on AVL 114 a §:n nojalla vähennyskelpoinen vain, jos henkilöauto on hankittu yksinomaan vähennykseen oikeuttavaan käyttöön — esimerkiksi myytäväksi tai vuokrattavaksi, taksiliikenteeseen tai ajo-opetukseen. Vähäinenkin yksityinen käyttö estää vähennyksen kokonaisuudessaan. Henkilöauton määritelmä viittaa ajoneuvolainsäädännön M1-luokkaan: enintään kahdeksan istumapaikkaa kuljettajan lisäksi. Pakettiauton (N1-luokka) osalta sovelletaan eri sääntöjä.",
    },
    {
      id: "ve-c3",
      source: "Verohallinto — henkilöautojen ja pakettiautojen ALV-vähennys",
      text:
        "Verohallinnon ohje selventää AVL 114 ja 114 a §:n soveltamista käytännössä. Henkilöauton hankinnan tai käyttökulujen ALV ei ole vähennyskelpoinen, jos autoa käytetään edes vähäisessä määrin yksityisesti. Kodin ja vakituisen työpaikan välinen ajo katsotaan yksityiseksi käytöksi vakiintuneen oikeuskäytännön mukaisesti. Pakettiauton (N1-luokka) osalta vähennys voidaan jakaa käytön suhteessa, jos osa käytöstä on yksityistä; tällöin yksityiskäytön osuus on osoitettava luotettavasti. Ajopäiväkirja, jossa erotellaan liike- ja yksityisajot, on suositeltava jaon perusteena. Ohjeessa käsitellään myös työsuhdeautoja, vuokra-autoja ja sähköautoja erikseen.",
    },
    {
      id: "ve-c4",
      source: "KHO ratkaisuja — vähennysoikeus ajoneuvoissa",
      text:
        "KHO:2017:31: Pakettiauto, jolla suoritettiin pääosin tavarankuljetuksia, mutta jolla myös ajettiin kuljettajan asunnon ja työpaikan välillä. KHO katsoi, että vähennyksestä on tehtävä yksityiskäyttöä vastaava osuus, mutta täysimääräinen vähennysoikeuden epääminen ei ollut perusteltua. Vastaavasti henkilöautojen osalta KHO on toistuvasti katsonut, että vähäinenkin yksityinen käyttö estää vähennyksen kokonaisuudessaan AVL 114 a §:n nojalla. KHO:2015:80 koski leasing-autoja ja niiden käyttöä myyntiedustajien työajossa. Muissa ratkaisuissa on käsitelty erityyppisten ajoneuvojen luokittelua sekä työajopäiväkirjan riittävyyttä todistelumielessä.",
    },
    {
      id: "ve-c5",
      source: "Neuvoston direktiivi 2006/112/EY — vähennysoikeus ja rajoitukset",
      text:
        "EU:n arvonlisäverodirektiivin VII osasto sääntelee vähennysoikeutta yhtenäisesti jäsenvaltioissa. Direktiivin 168 artikla luo pääsäännön: verovelvollinen saa vähentää verollista liiketoimintaa varten ostamansa veron. Direktiivin 176 artikla sallii jäsenvaltioiden ylläpitää vähennysoikeuden rajoituksia, jotka koskevat menoja, jotka eivät ole luonteeltaan tiukasti liiketoiminnallisia — kuten ylellisyysmenoja, edustusta, viihdettä ja vapaa-ajan toimintaa. Henkilöautot kuuluvat tyypillisesti tähän kategoriaan, koska niiden yksityiskäytön rajaaminen on vaikeaa. Direktiivin 173–175 artiklat säätelevät osittaisvähennysten laskemista, kun hankinta liittyy sekä verolliseen että verottomaan toimintaan.",
    },
  ],

  "entertainment-deductibility": [
    {
      id: "en-c1",
      source: "EVL § 8 — vähennyskelpoiset menot (laajempi konteksti)",
      text:
        "Vähennyskelpoisia menoja ovat muun muassa henkilökunnan virkistyksestä, koulutuksesta ja muusta vastaavasta toiminnasta aiheutuneet kohtuulliset menot täysimääräisinä. Edustusmenoista vähennetään 50 prosenttia. Edustusmenoilla tarkoitetaan menoja, jotka kohdistuvat liike- tai elinkeinotoimintaan liittyvien suhteiden luomiseen, säilyttämiseen tai edistämiseen yrityksen ulkopuolisiin henkilöihin nähden. Henkilökuntakuluiksi katsotaan koko henkilökunnalle suunnatut, tavanomaiset ja kohtuulliset tilaisuudet — kuten pikkujoulut, kesäjuhlat, urheilupäivät tai muu työhyvinvointia tukeva toiminta. Verovapaina henkilökuntaetuina pidetään vain kohtuullisia ja koko henkilökunnan käyttöön tarkoitettuja etuja.",
    },
    {
      id: "en-c2",
      source: "AVL § 114 — vähennysoikeuden rajoitukset (laajempi konteksti)",
      text:
        "Vähennystä ei saa tehdä, kun hankinta koskee: 1) verovelvollisen tai hänen henkilökuntansa asunnon ja työpaikan välistä kuljetusta; 2) edustusmenoja; 3) verovelvollisen tai hänen henkilökuntansa yksityistä käyttöä; tai 4) henkilöauton hankintaa, vuokrausta tai käyttöä, lukuun ottamatta 114 a §:ssä säädettyjä tapauksia. Edustusmenoista ei siten myönnetä ALV-vähennystä lainkaan, vaikka tuloverotuksessa puolet menoista vähennetään. AVL 114 § koskee myös vapaa-ajan kiinteistöjen, vapaa-ajan veneiden ja vastaavien menojen arvonlisäveroa. Henkilökunnan virkistyskulujen ALV on sen sijaan vähennyskelpoinen, kun tilaisuus on koko henkilökunnan käytettävissä.",
    },
    {
      id: "en-c3",
      source: "Verohallinto — edustus- ja henkilökuntamenot (täysi ohje)",
      text:
        "Verohallinnon ohje erottelee edustusmenot, henkilökuntakulut ja yksityismenot. Edustusmenoista vähennetään tuloverotuksessa 50 % (EVL 8 §) ja ALV ei ole vähennyskelpoinen (AVL 114 §). Henkilökunnan virkistystilaisuudet, kun ne on järjestetty koko henkilökunnalle ja menot ovat kohtuullisia, ovat tuloverotuksessa täysimääräisesti ja ALV vähennyskelpoisia. Rajatapaukset ratkaistaan tilaisuuden tarkoituksen, osallistujakunnan ja menojen kohtuullisuuden perusteella henkilöä kohti. Mikäli tilaisuuteen osallistuu sekä henkilökuntaa että ulkopuolisia, kulut voidaan jakaa pro rata osallistujamäärän mukaan. Lahjojen, mainoslahjojen ja markkinointikulujen luokittelu seuraa erillisiä sääntöjä.",
    },
    {
      id: "en-c4",
      source: "KHO ratkaisuja — edustuksen ja henkilökuntakulujen luokittelu",
      text:
        "KHO:2018:91: Yhtiö järjesti vuosittaisen pikkujoulun koko henkilökunnalle ravintolassa. KHO katsoi, että tilaisuus oli luonteeltaan henkilökunnan virkistystä eikä edustusta, vaikka osallistujille tarjottiin myös alkoholia, ja kulut olivat täysimääräisesti vähennyskelpoisia. Muissa ratkaisuissa KHO on katsonut, että pieni osa asiakkaita osallistuvaa tilaisuutta voi muuttaa luonteen kokonaan edustukseksi, jolloin sovelletaan 50 %:n tuloverosääntöä ja AVL:n vähennysrajoitusta. KHO:2014:96 koski yhtiön golf-tapahtumaa ja vakiinnutti rajan kohtuulliselle henkilökuntatoiminnalle. KHO:2020:113 käsitteli etäjuhlia ja niihin liittyviä alkoholihankintoja.",
    },
    {
      id: "en-c5",
      source: "Neuvoston direktiivi 2006/112/EY art. 176",
      text:
        "Direktiivin 176 artikla sallii jäsenvaltioiden ylläpitää liittymishetkellä voimassa olleita vähennysoikeuden rajoituksia, jotka koskevat menoja, jotka eivät ole luonteeltaan tiukasti liiketoiminnallisia — erityisesti ylellisyysmenoja, edustusta, viihdettä ja vapaa-ajan toimintaa. Suomi on hyödyntänyt tätä mahdollisuutta AVL 114 §:ssä. Direktiivin 168 artikla puolestaan turvaa yleisen vähennysoikeuden verollisia liiketoimia varten tehtyihin hankintoihin. Direktiivin 173–175 artiklat sääntelevät osittaista vähennysoikeutta sekä-toimintaa harjoittavilla yrityksillä. Jäsenvaltiot ovat soveltaneet rajoituksia hieman eri tavoin, mutta edustusmenojen vähennyskielto on EU:ssa yleinen.",
    },
  ],
};

// Used when no guardrail matches the query (and therefore no specific intent
// is identified). The freelancer-B2B chunk set works as the neutral default
// because it spans the broadest legal vocabulary.
export const DEFAULT_FLAT_CHUNKS = FLAT_CHUNKS_BY_INTENT["freelancer-b2b-vat"];
