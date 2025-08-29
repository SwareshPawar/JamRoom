import React, { useState } from 'react';
import Login from './Login';
import Home from './Home';
import { instruments } from './instruments';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedInstrument, setSelectedInstrument] = useState('');

  // Demo login handler
  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  if (!isLoggedIn) {
    // Pass demo login handler to Login page
    return <Login onLogin={handleLogin} />;
  }

  return (
    <>
      <Home />
      <div className="w-full max-w-md mx-auto mt-8 bg-white rounded shadow p-6">
        <label className="block mb-2 font-semibold">Select Instrument:</label>
        <select
          className="w-full p-2 border rounded mb-4"
          value={selectedInstrument}
          onChange={e => setSelectedInstrument(e.target.value)}
        >
          <option value="">-- Choose an instrument --</option>
          {instruments.map(inst => (
            <option key={inst.name} value={inst.name}>{inst.name}</option>
          ))}
        </select>

        {selectedInstrument && (
          <div>
            <h2 className="text-xl font-bold mb-2">Fields for {selectedInstrument}:</h2>
            <ul className="list-disc ml-6">
              {instruments.find(i => i.name === selectedInstrument).fields.map(field => (
                <li key={field}>{field}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

export default App;
