import React from 'react';

function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-8">
      <h1 className="text-5xl font-extrabold text-purple-700 mb-4">JamRoom</h1>
      <p className="mb-8 text-xl text-gray-700">Book your slot, select your instruments, and enjoy your jam session!</p>
      <div className="w-full max-w-lg bg-white rounded shadow p-6">
        <h2 className="text-2xl font-bold mb-4 text-blue-600">How it works</h2>
        <ul className="list-disc ml-6 text-lg text-gray-800">
          <li>Login or register to get started</li>
          <li>Choose your preferred instruments</li>
          <li>Select an available slot</li>
          <li>Book and receive confirmation</li>
        </ul>
      </div>
    </div>
  );
}

export default Home;
