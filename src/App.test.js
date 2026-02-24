import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('react-cytoscapejs', () => {
  return function MockCytoscape() {
    return <div data-testid="cytoscape-mock">Cytoscape Mock</div>;
  };
});

test('renders app title', () => {
  render(<App />);
  const titleElement = screen.getByText(/QMS Graph Viewer/i);
  expect(titleElement).toBeInTheDocument();
});
