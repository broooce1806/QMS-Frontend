import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('react-cytoscapejs', () => {
  return function MockCytoscape() {
    return <div data-testid="cytoscape-mock">Cytoscape Mock</div>;
  };
});

jest.mock('reactflow', () => {
  const MockReactFlow = ({ children }) => <div data-testid="reactflow-mock">{children}</div>;
  MockReactFlow.displayName = 'MockReactFlow';
  return {
    __esModule: true,
    default: MockReactFlow,
    Background: () => null,
    Controls: () => null,
    Panel: ({ children }) => <div>{children}</div>,
    useNodesState: () => [[], jest.fn(), jest.fn()],
    useEdgesState: () => [[], jest.fn(), jest.fn()],
    addEdge: jest.fn(),
    MarkerType: { ArrowClosed: 'arrowclosed' },
    Handle: () => null,
    Position: { Top: 'top', Bottom: 'bottom' },
  };
});

test('renders QMS Pro app title', () => {
  render(<App />);
  const titleElement = screen.getByText(/QMS Pro/i);
  expect(titleElement).toBeInTheDocument();
});
