/**
 * GamerBooker Enterprise v1.0 — Generator Automat Google Form & Google Sheet
 * 
 * Instrucțiuni rapide (durează 15 secunde):
 * 1. Deschide în browser: https://script.new (asigură-te că ești conectat cu contul Google)
 * 2. Șterge ce este acolo și lipește tot codul din acest fișier.
 * 3. Apasă pe butonul "Run" (Execută) din bara de sus.
 * 4. Dă permisiunea cerută de Google (Review permissions -> Allow).
 * 5. În fereastra "Execution log" (Jurnal de execuție) de jos vor apărea imediat cele 2 link-uri:
 *    - Link Formular Public (pentru parteneri)
 *    - Link Foaie Răspunsuri (pentru admin)
 */

function createGamerBookerPartnerForm() {
  // 1. Creare Formular
  const form = FormApp.create('GamerBooker — Solicitare Înscriere Sală de Gaming & Internet Cafe');
  form.setDescription(
    'Formular oficial de parteneriat GamerBooker pentru săli de gaming, internet cafe-uri și arene esports.\n' +
    'Datele completate vor fi utilizate de administratorul platformei pentru crearea contului și configurarea inițială a locației (tarife, stații, program).'
  );

  // 2. Adăugare întrebări obligatorii pentru configurare
  form.addTextItem()
    .setTitle('Nume Cafenea / Sală de Gaming')
    .setHelpText('Numele comercial al locației care va apărea în aplicația jucătorilor (ex: Nexus Gamers Pub)')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Denumire Juridică Firmă')
    .setHelpText('Numele companiei înregistrate la Registrul Comerțului (ex: Nexus Gaming Arena SRL)')
    .setRequired(true);

  form.addTextItem()
    .setTitle('CUI / CIF')
    .setHelpText('Codul Unic de Înregistrare fiscală (ex: RO34567890)')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Oraș')
    .setHelpText('Orașul în care se află sala (ex: București)')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Adresă completă sală')
    .setHelpText('Stradă, număr, bloc, sector / județ')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Adresă Email Contact')
    .setHelpText('Emailul proprietarului / reprezentantului legal pe care se va activa accesul de OWNER')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Număr Telefon Contact')
    .setHelpText('Număr pentru confirmare operațională și alerte')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Număr total stații PC')
    .setHelpText('Numărul de calculatoare destinate clienților (ex: 30)')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Tarif PC Standard (RON/oră)')
    .setHelpText('Tariful pe oră pentru stațiile standard de gaming (ex: 15.00)')
    .setRequired(true);

  form.addTextItem()
    .setTitle('Tarif PC VIP / Bootcamp 5v5 (RON/oră)')
    .setHelpText('Dacă aveți camere VIP sau zone de turneu (ex: 22.00)')
    .setRequired(false);

  form.addTextItem()
    .setTitle('Program de funcționare')
    .setHelpText('Intervalul orar de lucru (ex: Luni-Vineri 10:00 - 02:00, Sâmbătă-Duminică Non-Stop)')
    .setRequired(true);

  const tzItem = form.addListItem().setTitle('Fus Orar');
  tzItem.setChoiceValues(['Europe/Bucharest']);
  tzItem.setRequired(true);

  form.addParagraphTextItem()
    .setTitle('Dotări speciale & mențiuni pentru admin')
    .setHelpText('Specificații PC (GPU, Hz), simulatoare auto, console PS5, servire bar etc.')
    .setRequired(false);

  // 3. Creare Foaie Google Sheet conectată automat
  const sheet = SpreadsheetApp.create('GamerBooker — Răspunsuri Înscriere Parteneri');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

  // 4. Afișare link-uri
  Logger.log('=====================================================');
  Logger.log('SUCCESS! Formularul și Foaia au fost create cu succes:');
  Logger.log('1. LINK FORMULAR PUBLIC PENTRU PARTENERI:');
  Logger.log(form.getPublishedUrl());
  Logger.log('-----------------------------------------------------');
  Logger.log('2. LINK FORMULAR EDITARE (pentru tine):');
  Logger.log(form.getEditUrl());
  Logger.log('-----------------------------------------------------');
  Logger.log('3. LINK FOAIE GOOGLE SHEET CONECTATĂ:');
  Logger.log(sheet.getUrl());
  Logger.log('=====================================================');
}
