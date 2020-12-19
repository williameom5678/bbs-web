import { Modal, Spinner } from 'react-bootstrap'

function LoadingModal({ show, message }) {
  return (
    <Modal show={show} size='xs' backdrop='static' centered>
      <Modal.Header>
        {message}
      </Modal.Header>
      <Modal.Body className='text-center m-4'>
        <Spinner animation='border' />
      </Modal.Body>
    </Modal>
  )
}

export default LoadingModal
