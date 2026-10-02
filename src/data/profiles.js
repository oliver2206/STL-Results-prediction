// Player profiles for the "Profiles" tab.
//
// Each profile is one person and the lucky numbers they bet on.
// Add, remove, or edit entries below — no code knowledge needed, just follow
// the same { name, numbers } shape.
//
//   name    : the person's name (rename the "Person N" placeholders freely)
//   numbers : their lucky numbers or combos, e.g. "7" or "7-11"
//             (order doesn't matter — "11-7" and "7-11" are the same combo)
//
// Tap a lucky number on a card to jump to that number's full draw history.
// Person 1 (Niel) is real; Persons 2–20 are placeholders with sample numbers
// so the tab is full — replace the names and numbers with the real ones.

const profiles = [
    { name: 'Niel', numbers: ['35-30', '08-02', '7-11' '14-21',] },
    { name: 'Emma', numbers: ['14-20', '13-31', '07-11', '04-10', '02-09', '02-20', '10-10'] },
    { name: 'Tina', numbers: ['06-31 ', '25-25', '04-14', '26-29', '09-26', '10-16', '08-08'] },
    { name: 'Blesie', numbers: ['09-23', '09-28', '19-28', '10-02', '07-11', ] },
    {
        name: 'Prima',
        numbers: ['11-27', '06-14', '12-28', '07-22', '10-19', '09-28', '21-21', '35-35', '', ]
    },
    { name: 'Ason Gascon', numbers: ['14-16', '14-19', '11-30', '01-30', '15-21', '01-03', '', ] },
    { name: 'Ns', numbers: ['10-28', '10-26', '11-28', '10-28', '03-10', '08-19', '08-16', '10-19', '02-10', '04-10', '13-19', '08-19', '10-10', ] },
    { name: 'Amboy ', numbers: ['13-29', '20-23', '11-16', '11-18', '08-10', '03-13', '', '', '', '', '', ''] },
    { name: 'Erwin', numbers: ['7-11', '04-07', '5-12', '9-12', '10-18', '09-21', '', '', ''] },
    { name: 'Mels', numbers: ['18-24', '17-14', '14-20', '09-29', '29-32', '08-27', '03-17', '', ''] },
    { name: 'Ella', numbers: ['10-12', '09-30', ''] },
    { name: 'Cassio', numbers: ['02-29', '06-33', '08-26'] },
    { name: 'Basilio', numbers: ['7-15', '', ''] },
    { name: 'Nilda', numbers: ['01-21 ', '10-23', ''] },
    { name: 'Tems', numbers: ['15-36', '04-28', '04-36', '20-02', '20-20', '13-36', '08-15', '14-20', ''] },
    { name: 'Nano', numbers: ['', '', ''] },
    { name: 'floring', numbers: ['11-30', '30-30', '29-29'] },
    { name: 'Person 18', numbers: ['09-34', '26-02', '17-20'] },
    { name: 'Person 19', numbers: ['05-28', '35-12', '23-31'] },
    { name: 'Person 20', numbers: ['16-38', '24-01', '11-33'] },
]

export default profiles
